import { h, Fragment, render, FunctionComponent } from "preact";
import { useState, useRef, useEffect, useMemo } from "preact/hooks";
import { v4 as uuid } from "uuid";
import Fuse from "fuse.js";
import { compressToEncodedURIComponent, decompressFromEncodedURIComponent } from 'lz-string';

import {
  Input,
  LastUpdated,
  IconButton,
  Empty,
  Content,
  Heading,
  OnboardingTip,
  HasHeaders,
} from "./ui/kit";

//import { Group } from "aws-sdk/clients/budgets";

type UiMessage =
  | { type: "set-step-on-selection"; payload: null | Step }
  | { type: "set-step"; payload: { key: string; step: Step } }
  | { type: "delete-step"; payload: string }
  | { type: "select-step"; payload: string }
  | { type: "request-all-steps-for-download" }
  | { type: "request-all-steps" }
  | { type: "send-flow"; payload: {data: Array<{TNID: string, ID: string}>; type: string}}
  | { type: "gather-json"; }
  | { type: "get-groups"; }
  | { type: "add-to-groups"; payload: string}
  | { type: "set-to-new-group"; payload: string }
  | { type: "delete-group"; payload: string }
  | { type: "set-token"; payload: string}
  | { type: "set-link"; payload: string}
  | { type: "check-for-filled-inputs"}
  | { type: "send-uuid"; payload: { UUID: string; ID: string } }
  | { type: "error-message"; payload: string}
  | { type: "evaluate-response";}
  | { type: "set-name";}

type PluginMessage =
  | {
    type: "selection";
    payload: null | { name: string; step: null | Step;};
  }
  | { type: "all-steps-for-download"; payload: Array<Step> }
  | { type: "all-steps"; payload: Array<Step> }
  | { type: "get-flow"; payload: {linkSeg: string; token: string; pageNodeID: string; type: string} }
  | { type: "generate-link"; payload: Array<Step> }
  | { type: "send-groups"; payload: Array<string>}
  | { type: "startup"; payload: string}
  | { type: "has-filled-inputs";}
  | { type: "new-uuid"; payload: string}
  | { type: "set-token-and-url"; payload: {url: string; token: string};}
  | { type: "test-api-req"; payload: {url: string; token: string};}
  | { type: "set-to-saved"; payload: string}
  | { type: "change-to-primary";}

type Language = "en-US" | "en-AU" | "es-419" | "es-ES" | "fr-CA" | "pt-BR";

type I18n = Record<Language, { body: string }>;

type Subscriber = (pluginMessage: PluginMessage) => void;

const pluginStream = (() => {
  let subscribers: Array<Subscriber> = [];
  return {
    subscribe: (subscriber: Subscriber) => {
      subscribers = [...subscribers, subscriber];
    },
    unsubscribe: (subscriber: Subscriber) => {
      subscribers = subscribers.filter(
        (currentSubscriber) => currentSubscriber !== subscriber
      );
    },
    send: (msg: PluginMessage) => {
      subscribers.forEach((subscriber) => {
        subscriber(msg);
      });
    },
  };
})();

interface Step {
  key: string;
  body: string;
  name?: string;
  i18n: Record<Language, { body: string }>;
  group?: string;
  description?: string;
  trigger?: {
    selector: string;
  };
  // For canvas view
  linksTo?: String[];
  canvasX?: number;
  canvasY?: number;
  end?: boolean;
  escalate?: boolean;
  automate?: boolean;
  imageKey?: string;
  lastUpdated?: string;
}

const languages: Array<{ value: Language; label: string }> = [
  {
    value: "en-US",
    label: "🇺🇸 English (US)",
  },
  {
    value: "en-AU",
    label: "🇦🇺 English (AU)",
  },
  {
    value: "es-419",
    label: "🇦🇷 Spanish (LATAM)",
  },
  {
    value: "es-ES",
    label: "🇪🇸 Spanish (ES)",
  },
  {
    value: "fr-CA",
    label: "🇨🇦 French (CA)",
  },
  {
    value: "pt-BR",
    label: "🇧🇷 Portuguese (BR)",
  },
];

const voiceByLanguage = {
  "en-US": "Matthew",
  "en-AU": "Olivia",
  "es-ES": "Lupe",
  "es-US": "Lupe",
  "es-419": "Lupe",
  "pt-BR": "Camila",
};

const defaultLanguage = "en-US";

const postMessage = (msg: UiMessage) => {
  parent.postMessage(
    {
      pluginMessage: msg,
    },
    "*"
  );
};

const colors: Array<string> = ["#845cec", "#47A0F4", "#EEB45D", "#73D3C2", "#FF7575", "#6EBB53", "#4419C0", "#FFDB5B", "#FF85CE", "#427E7B", "#9DD0FF"];

//Using Figma API
const testAPIReq = (url: string, token: string) => {
  const error: string = "Either the page link or access token you entered are invalid"
  let finalLink: string = "https://api.figma.com/v1/files/" + url
  getAPIData(finalLink,token)
  .then((response) => {
    if (response.err) {
      handleError(error);
    } else {
      postMessage({
        type: "evaluate-response",
      })
    }
  })
  .catch(() => {
    handleError(error);
  })
}

const handleError = (msg: string) => {
  postMessage({
    type: "error-message",
    payload: msg,
  })
  document.getElementById("createJourneyBtn").setAttribute('class','settings-primary');
}


//Skeleton for creating Figma API requests
const getAPIData = async (url = '', token: string) => {
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      'X-Figma-Token': token,
    },
  });
  return response.json(); 
}

//traverses figma API data and returns the transitionNodeIDs which translate to linksTo
const getFlowData = (link: string, token: string, pageNodeID: string, type: string) => {

  const error: string = "There was an issue with either your access token or page link. Please modify these in Settings and try again"

  let linkFinal: string = "https://api.figma.com/v1/files/" + link;

  getAPIData(linkFinal,token)
  .then(response => {

    if (response.err) {
     handleError(error);
     document.getElementById("loadingWheel").setAttribute("style","visibility: hidden");
    } else {
      //TNID= transitionNodeID
      let data: Array<{TNID: string, ID: string}> = [];

      let pageNodeIndex: number;

      for (let i = 0; i <= response.document.children.length; i++) {
        if (response.document.children[i].id === pageNodeID){
          pageNodeIndex = i;
          break;
        }
      }

      response.document.children[pageNodeIndex].children.forEach(function(e){  //traversing frame nodes
        if(typeof e.transitionNodeID !== 'undefined'){
          data.push({TNID: e.transitionNodeID, ID: e.id})
        }
      })

      response.document.children[pageNodeIndex].children.forEach(function(j){
        if(j.children !== []){
          j.children.forEach(function(i) {  //traversing children of frame nodes
            if(typeof i.transitionNodeID !== 'undefined'){
              data.push({TNID: i.transitionNodeID, ID: j.id})
            }
          })
        }
      })

      postMessage({
        type: "send-flow",
        payload: {
          data: data,
          type: type,
        }
      })
    }
  })
  .catch(() => {
    handleError(error);
    document.getElementById("loadingWheel").setAttribute("style","visibility: hidden");
  });
}

//Function Components

const PlayButton: FunctionComponent<{
  transcript: string;
  voice?: string;
  language: Language;
}> = (props) => {
  const [playing, setPlaying] = useState(false);
  const [error, setError] = useState(false);

  const audioRef = useRef(null);

  useEffect(() => {
    if (error) {
      setTimeout(() => {
        setError(false);
      }, 1500);
    }
  }, [error]);

  const handlePause = () => {
    if (playing && audioRef.current) {
      audioRef.current.pause();
      setPlaying(false);
    }
  };

  const handlePlay = () => {
    setPlaying(true);
    fetch(
      "https://e5dy32q8d1.execute-api.us-east-1.amazonaws.com/prod/webhook",
      {
        method: "POST",
        headers: {
          "x-api-key": "l8hLBz8Ls73nZaVWvLgWw8E9GmzkWyW4aSIIpcnR",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          text: props.transcript,
          voice: voiceByLanguage[props.language] || "Matthew",
          language: props.language,
        }),
      }
    )
      .then((res) => res.json())
      .then((response) => {
        if (response.errorMessage) {
          throw new Error(response.errorMessage);
        }
        const base64Sound = response;
        const audio = new Audio(`data:audio/mp3;base64,${base64Sound}`);
        audio.addEventListener("ended", () => {
          setPlaying(false);
        });
        audio.play();
        audioRef.current = audio;
      })
      .catch(() => {
        setPlaying(false);
        setError(true);
      });
  };

  return (
    <IconButton
      icon={playing ? "close" : "play"}
      title={playing ? "Pause" : "Play"}
      onClick={playing ? handlePause : handlePlay}
      error={error}
    />
  );
};

const StepEditor: FunctionComponent<{
  value: Step;
  onChange: (newVal: Step) => void;
  onDelete?: () => void;
  onSelect?: () => void;
  error?: string;
  language: Language;
  nodesTab: boolean;
}> = ({ value, error, onSelect, onChange, onDelete, language, nodesTab}) => {
  return (
    <div>
      <div class="flex space-x-1">
        <div class="space-y-1 space-x-4" style="width: 400px; margin: auto;">
          <div style="margin-left: 72px;">
            <HasHeaders
              header="Node Name"
              mode={nodesTab}
            />
          </div>
          <div style="display: flex; flex-direction: row; margin-left: 32px; margin-top: 2px">
            {onSelect && (
              <div>
                <IconButton icon="frame" title="Go to this node" onClick={onSelect} />
              </div>
            )} 
            {!onSelect && (
              <div class="icon icon--frame"></div>
            )}
            <div style="width: 300px;">
              <Input
              value= {value.name}
              onChange={(newVal: string) => {
                value.name = newVal;
                onChange({
                  ...value
                });
              }}
              selectAll
              disabled
            />
            
            </div>
            {onDelete && (
          <div>
          <IconButton icon="trash" title="Delete step" onClick={onDelete} />
          </div>
        )}
          </div>

          <div style="margin-top: 30px;">
            <HasHeaders
              header="Phrase"
              mode={nodesTab}
            />
          </div>

          <div style="display: flex; flex-direction: row; margin-left: 32px; margin-top: 2px">
            <PlayButton
              transcript={
                language === defaultLanguage
                ? value.body
                : value.i18n[language] && value.i18n[language].body
              }
              language={language}
            />

            <div style="width: 300px;">
                <Input
                placeholder="Type your phrase"
                multiline
                value={
                  language === defaultLanguage
                  ? value.body
                  : value.i18n[language]
                  ? value.i18n[language].body
                  : ""
                }
                onChange={(newVal: string) => {
                  language === defaultLanguage
                  ? value.body = newVal
                  : value.i18n[language]
                  ? value.i18n[language].body = newVal
                  : ""
                  onChange({
                    ...value,
                    ...(language === defaultLanguage
                    ? { body: newVal }
                    : { i18n: { ...value.i18n, [language]: { body: newVal } }, }),
                  });
                }}
              />

            </div>
          </div>
        </div>
      </div>

      {error && (
        <p style="color: #f00; background-color: rgba(255, 0, 0, 0.05); margin-left: 80px; padding: 10px;">
          <small>{error}</small>
        </p>
      )}
    </div>
  );
};

const SidebarButton: FunctionComponent<{
  text: string;
  active?: boolean;
  onClick?: () => void;
}> = (props) => (
  <div>
  <button
    onClick={props.onClick}
    class={'tab-button font'}
    style={`color: ${props.active ? "#845cec" : "#757575"};`}
  >
    {props.text}
  </button>
  <hr style={`width: 45px; height: 3px; margin-top: -3px; background-color: #845cec; border-color: #845cec; visibility: ${props.active ? "visible" : "hidden"}; z-index: 1000;`}></hr>
  </div>
);

const App: FunctionComponent<{}> = () => {
  const [language, setLanguage] = useState<Language>(defaultLanguage);

  const [tab, setTab] = useState<"frame" | "list-detailed" | "settings" | "get-started" | "change-token">(
    "frame"
  );

  const [confirm, setConfirm] = useState<{
    body: string;
    onConfirm: () => void;
  } | null>(null);

  const [search, setSearch] = useState<string>("");

  const [selection, setSelection] = useState<null | {
    name: string;
    step?: Step;
  }>(null);

  const [steps, setSteps] = useState<Array<Step>>([]);

  const [compressedJSON, setCompressedJSON] = useState<string>("");

  const [groups, setGroups] = useState<Array<string>>(["Main"]);

  const _inputRef = useRef<HTMLInputElement>();

  const _inputRef2 = useRef<HTMLInputElement>();

  const [accessToken, setAccessToken] = useState<string>("");

  const tokenRef = useRef<HTMLInputElement>();

  const [pageLink, setPageLink] = useState<string>("");

  const linkRef = useRef<HTMLInputElement>();

  const [buttonText, setButtonText] = useState<string>("Create Journey");

  const [linkSave, setLinkSave] = useState<string>("Save");

  const [tokenSave, setTokenSave] = useState<string>("Save");

  const [copied, setCopied] = useState<string>("Copy Data");

  //sends a new key to the backend with a corrosponding Node ID
  const generateUUID = (ID: string) => {
    postMessage({
      type: "send-uuid",
      payload: {
        UUID: uuid(),
        ID: ID,
      }
    })
  }

  //compresses json step data
  const compressData = async (json: Step[]) => {
    const data : string = compressToEncodedURIComponent(JSON.stringify(json));
    await setCompressedJSON(data);
    setCopied("Copied to clipboard!");
    document.getElementById("copyDataBtn").setAttribute('class','settings-secondary')
    document.getElementById("loadingWheel").setAttribute("style","visibility: hidden");
    copyText();
  }

  //copies text in settings textbox
  const copyText = () => {
    if (_inputRef) {
      _inputRef.current.select();
      document.execCommand("copy");
    }
  }

  //updates groups coming from backend
  const updateGroups = (arr: string[]) => {
    setGroups(arr)
  }

  const Groups: FunctionComponent<{
    name: string;
  }> = (props) => {
    const [pressed, setPressed] = useState<boolean>(false);
    useEffect(() => {
      if(tab !== "frame" || selection.name !== props.name){
        setPressed(false);
      }
    })
    return(
      <div style="margin-left: 105px; margin-top: 10px; display: flex; flex-direction: row">

        <div style="display: flex; flex-direction: column; margin-top: 17px">
          <div class="font" style="font-size: 85%; margin-left: 5px; margin-bottom: 3px; color: #757575">Group</div>

          <div style="display: flex; flex-direction: row;">
            <select
            class="dropdown settings-secondary"
            value={selection.step.group}
            onChange={(ev: any) => {
              postMessage({
                type: "set-to-new-group",
                payload: ev.target.value,
              })
            }}
            >
            {groups.map((group) => (
              <option class="font options"value={group}>{group}</option>
            ))
            }
            </select>

            <div style="display: flex; flex-direction: column; margin-left: 20px">
              <button
              id="createGroupBtn"
              class= "settings-primary underline2"
              style={`position: relative; visibility: ${pressed ? "hidden" : "visible"}; width: 150px; font-size: 12px; padding: 5px 10px; color: #845cec; background-color: white; border: none; margin-top: 0; font-size: 13px; box-shadow: 0 0 0 1px transparent;`}
              onClick={() => {
                if (!pressed) {
                  setPressed(true);
              }}}
              >
              + Create a new group
              </button>
            
              <div id="groupTxtBox" class="special-input" style={`visibility: ${pressed ? "visibile" : "hidden"}`}>
                <input
                id="focus"
                class="font b" 
                style="border: 1px solid var(--black1); border-radius: 5px; width: 100%; height: 100%; padding: 0px 5px"
                ref={_inputRef2}
                type="text" 
                placeholder="Enter group name"
                />
              <button
              class="settings-primary"
              style="position: absolute; right: 4px; top: 4px; width: 60px; height: 24px; border-radius: 6px;"
              onClick={() => {
                selection.step.group = _inputRef2.current.value;
                postMessage({
                  type: "add-to-groups",
                  payload: _inputRef2.current.value
                })
                postMessage({
                  type: "set-to-new-group",
                  payload: _inputRef2.current.value,
                })
              }}
              > 
              Submit
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
    )
  }

  const GroupsInSettings: FunctionComponent<{
  }> = () => {
    let selected: string = "Group";
    return(
      <div class="settings-box">
          <div class="settings-headers font">Manage Groups</div>
            <select
            class="settings-secondary"
            style="width: 90px"
            value = "Group"
            onChange={(ev: any) => {
              selected = ev.target.value;
            }}
            >
            <option value="Group" class="font options" disabled selected>Group</option>
            {groups.map((group) => (
              <option value={group} class="font options">{group}</option>
            ))
            }
            </select>
            <button
            id="deleteGroupBtn"
            class="settings-secondary"
            onClick={() => {
              if (selected === "Main"){
                postMessage({
                  type: "error-message",
                  payload: "Main is the default group. It cannot be deleted."
                })
              } else if (selected !== "Group") {
                setConfirm({
                  body:
                    `Are you sure you want to delete the group: "${selected}"? This action is irreversible.`,
                  onConfirm: () => {
                    postMessage({
                      type: "delete-group",
                      payload: selected,
                    })
                    postMessage({
                      type: "get-groups",
                    })
                  }
                });
              }
            }}
            >
              Click To Remove
            </button>
          </div>
    )
  }

  const GroupsRef: FunctionComponent<{
    groupName: string;
  }> = (props) => (
  <a
  class="group-indicator"
  style={`margin-left: 110px; background-color: ${groups.indexOf(props.groupName) < colors.length ? colors[groups.indexOf(props.groupName)] : "#B5B5B5"};`}
  >
    {props.groupName}
  </a>
  )

  const DeleteIcon: FunctionComponent<{
    step: Step;
  }> = (props) => (
    <div
    class="deletion a"
    onClick={() => {
      setConfirm({
        body:
          "Are you sure you want to delete this node? This action is irreverisble.",
        onConfirm: () => {
          postMessage({
            type: "delete-step",
            payload: props.step.key,
          });
        },
      });
    }}
    >
      <div style="padding: 8px 10px; margin-right: 2px; color: var(--black8)">Delete Node</div>
      <div style="height: 150%"class="icon icon--trash icon--black8"></div>
    </div>
  )
  

  useEffect(() => {
    const handlePluginMsg = (msg: PluginMessage) => {
      switch (msg.type) {
        case "selection":
          setSelection(msg.payload);
          if (document.getElementById("copyDataBtn")) {
            setCopied("Copy Data")
            document.getElementById("copyDataBtn").setAttribute('class','settings-primary');
          }
          break;
        case "all-steps-for-download":
          document.getElementById("downloadBtn").setAttribute('class','settings-secondary');
          downloadContent({
            filename: "Journey.json",
            content: JSON.stringify(msg.payload, null, 2),
          });
          break;
        case "all-steps":
          setSteps(msg.payload);
          break;
        case "get-flow":
          getFlowData(msg.payload.linkSeg,msg.payload.token,msg.payload.pageNodeID, msg.payload.type);
          break;
        case "generate-link":
          compressData(msg.payload);
          break;
        case "send-groups":
          updateGroups(msg.payload);
          break;
        case "startup":
          setAccessToken(msg.payload);
          setTab("get-started")
          break;
        case "has-filled-inputs":
          setTab("frame");
          break;
        case "new-uuid":
          generateUUID(msg.payload);
          break;
        case "set-token-and-url":
          setPageLink(msg.payload.url);
          setAccessToken(msg.payload.token);
          break;
        case "test-api-req":
          testAPIReq(msg.payload.url,msg.payload.token);
          setTimeout(() => {
            setLinkSave("Save");
            setTokenSave("Save");
            document.getElementById("saveToken").setAttribute('class','startup-button')
            document.getElementById("saveLink").setAttribute('class','startup-button')
          },1500);
          break;
        case "set-to-saved":
          setLinkSave("");
          document.getElementById("saveLink").setAttribute('class','icon icon--check check-change')
          setPageLink(msg.payload);
          break;
        case "change-to-primary":
          setLinkSave("Save");
          setTokenSave("Save");
          document.getElementById("saveLink").setAttribute('class','startup-button')
          document.getElementById("saveToken").setAttribute('class','startup-button')
          document.getElementById("createJourneyBtn").setAttribute('class','settings-primary');
      }
    }
 
    pluginStream.subscribe(handlePluginMsg);
    return () => {
      pluginStream.unsubscribe(handlePluginMsg);
    };
  }, []);

  useEffect(() => {
    if (tab === "list-detailed") {
      postMessage({
        type: "request-all-steps",
      });
    }
  }, [tab]);

  const groupSort = (a,b) => {
    if ( a.group < b.group){
      return -1;
    }
    if ( a.group > b.group){
      return 1;
    }
    return 0;    
  }

  const searchedSteps: Array<Step> = useMemo(
    () =>
      search.trim()
        ? new Fuse(steps, {
          keys: [
            "name",
            "body",
            "group",
            ...languages.map((language) => `i18n.${language.value}.body`),
          ],
        })
          .search(search)
          .map((item) => item.item)
        : steps.sort(groupSort),
    [steps, search]
  );

  return (
    <div
      class="flex"
      style="font-family: sans-serif; height: 100%; overflow: hidden;"
    >
      {confirm && (
        <div class="modal">
          <div class="modal-content">
            <p class="font" style="margin-bottom: 20px">
              <small style="font-size: 13px">{confirm.body}</small>
            </p>
            <div style="display: flex; flex-direction: row; margin-top: 10px">
              <button
                class="settings-secondary underline2"
                style="margin-left: 30px; font-size: 13px; border: none; margin-bottom: 10px"
                onClick={() => {
                  setConfirm(null);
                }}
              >
                Cancel
              </button>
              <button
                class="settings-primary"
                style="margin-left: 50px; margin-bottom: 5px; font-size: 13px; padding: 0 5px"
                onClick={() => {
                  confirm.onConfirm();
                  setConfirm(null);
                }}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
      <div class="sidebar" style={`visibility: ${(tab === "get-started" || tab === "change-token") ? "hidden" : "visible"};`}>
        <SidebarButton
          text ="New Node"
          active={tab === "frame"}
          onClick={() => {
            setTab("frame");
            postMessage({
              type: "get-groups",
            })
          }}
        />
        <SidebarButton
          text = "All Nodes"
          active={tab === "list-detailed"}
          onClick={() => {
            setTab("list-detailed");
          }}
        />
        <SidebarButton
          text = "Settings"
          active={tab === "settings"}
          onClick={() => {
            setTab("settings");
            setCompressedJSON("");
            setCopied("Copy Data")
            //switchSettings();
          }}
        />
        <hr class="menu-hr" style="bottom: 381px; z-index: 999; margin-top: 7px; background-color: #D9D9D9; "></hr>
        <hr class="menu-hr" style="bottom: 341px; z-index: 998; background-color: #D9D9D9;"/>
      </div>
      <div style="height: 458px; overflow: auto; position: absolute; top: 42px; width: 520px">
        {tab === "frame" && (
          <Fragment>
            <Content>
              {selection && !selection.step ? (
                <div style= "margin-left: 30px; margin-top: 30px">
                <Fragment>
                  <Heading title="Journey Assistant Node" style='color: #353230; font-size: 15px; font-weight: 500'>
                  </Heading>
                  <div style= "margin-left: 20px; font-size: 13px; color: #353230">
                  <OnboardingTip body={selection.name} icon={"frame"} />
                  {selection.step?.lastUpdated && (
                    <LastUpdated lastUpdated={selection.step?.lastUpdated} />
                  )}
                  {!selection.step && (
                    <p style="margin: 0">
                      <small class="font" style="color: #BBBBBB; padding-left: 40px; font-size: 13px">
                        No node available
                      </small>
                    </p>
                  )}
                  </div>
                </Fragment>
                </div>
              ) : null}
              {selection ? (
                selection.step ? (
                  <Fragment>
                    <div style="position: absolute; top: 45px; right: 91px">
                    <LanguageSelect language={language} setLanguage={setLanguage} />
                    </div>
                    <div style="margin-left: 30px;">
                    <Heading style="margin-bottom: 0px; margin-top: 8px; color: #353230; font-size: 15px; font-weight: 500" title="Journey Assistant Node">
                  </Heading>
                  </div>
                  <StepEditor
                    nodesTab={true}
                    language={language}
                    value={selection.step}
                    onChange={(newStep: Step) => {
                      postMessage({
                        type: "set-step-on-selection",
                        payload: newStep,   
                      });
                    }}
                  />
                  
                  <Groups
                  name={selection.name}  
                  /> 

                  <DeleteIcon step={selection.step}/>

                  </Fragment>
                  
                ) : (
                  <button
                    class="settings-primary"
                    style="margin-left: 65px; margin-top: 20px; padding: 0 7px 0 10px; letter-spacing: 0; width: 119px; height: 38px; border-radius: 9px; font-size: 16px;"
                    onClick={() => {
                      postMessage({
                        type: "set-step-on-selection",
                        payload: {
                            key: uuid(),
                            body: "",
                            name: selection.name,
                            i18n: {} as I18n,
                            group: "Main",
                            linksTo: [],
                            canvasX: 0,
                            canvasY: 0,
                          },
                      });
                      postMessage({
                        type: "set-name",
                      })
                    }}
                  >
                    Create Node
                  </button>
                )
              ) : (
                <div style="margin-top: 30px">
                <Empty />
                </div>
              )}
            </Content>
          </Fragment>
        )}
        {tab === "list-detailed" && (
          <Fragment>
            <Content>
              <div class="space-y-3" style="width: 376px; margin: auto; margin-top: 16px; margin-bottom: 0">
              <Input
                value={search}
                onChange={setSearch}
                placeholder="Search nodes"
              />
              </div>
              <div style="margin-top: 0">
                {searchedSteps.map((step, index) => (
                  <div style="margin-top: 0">
                    <div style="height: 30px"></div>
                    <GroupsRef
                    groupName= {step.group}
                    />
                    <div style="height: 5px"></div>
                  <StepEditor
                    nodesTab={false}
                    key={index}
                    value={step}
                    onChange={(newStep: Step) => {
                      postMessage({
                        type: "set-step",
                        payload: { key: step.key, step: newStep },
                      });
                    }}
                    onDelete={() => {
                      setConfirm({
                        body:
                          "Are you sure you want to delete this node? This action is irreverisble.",
                        onConfirm: () => {
                          postMessage({
                            type: "delete-step",
                            payload: step.key,
                          });
                        },
                      });
                    }}
      
                    onSelect={() => {
                      postMessage({
                        type: "select-step",
                        payload: step.key,
                      });
                      setTab("frame");
                    }}
                    language={language}
                  />
                  </div>
                ))}
              </div>
            </Content>
          </Fragment>
        )}
        {tab === "settings" && (
          <Fragment>
            <Content>       
              <div>
                <GroupsInSettings/>
              </div>  
              <div class="settings-box">
                <div class="settings-headers font">Access token and link</div>
                <button
                class="settings-secondary"
                onClick={() => {
                  setButtonText("Apply Changes")
                  setTab("change-token")
                }}
                >
                Edit  
                </button>
              </div>

              <DownloadBtn />

              <div style={`border: ${compressedJSON === "" ? "transparent" : "1px solid #757575"}; border-radius: 4px; width: 380px; height: 200px; margin: auto; margin-top: 16px; position: relative;`}>
                <div class="settings-box" style={`margin: 0; border: ${compressedJSON === "" ? "1px solid #757575" : "transparent"};`} >
                  <div class="settings-headers font">Link to Voice Compass</div>
                  <span style="z-index: 999" class="dot myDIV"> ?</span>
                  <div class="hide">Copy your data and sign in to Voice Compass on your internet browser. Hit the Create your journey button using the “Import” option. Follow the steps to connect your designs!</div> 
                  <div id= "loadingWheel" style="visibility: hidden" class="loading"></div>
                  <button
                  id="copyDataBtn"
                  class="settings-primary"
                  style="z-index: 997"
                  onClick={() => {
                    document.getElementById("loadingWheel").setAttribute("style","visibile");
                    postMessage({
                      type: "gather-json",
                      });
                    }}
                    >
                    {copied}
                  </button>
                </div>

            <div id="showLink" style={`display: flex; flex-direction: column; visibility: ${compressedJSON === "" ? "hidden" : "visible"}; margin: auto; margin-top: 0; margin-bottom: 0; width: 365px`}>   
                <input 
                ref={_inputRef}
                id="textToCopy"
                class="input__field block w-full font b" 
                style="border: 1px solid var(--black1); color: #757575; font-size: 13px"
                readonly 
                value={compressedJSON}
                />
                <p class="list2" style="font-size:80%; margin-top: 5px">Next Steps: </p>
                <div style="margin-left: 8px; font-size:80%;">
                  <p class="list2">1. Open Voice Compass in your browser</p>
                  <p class="list2">2. Select Create Journey</p>
                  <p class="list2">3. Select Import</p>
                  <p class="list2">4. Follow the steps to connect your designs</p>
                </div>
                </div>
                </div>
            </Content>
          </Fragment>
        )}
        {tab === "get-started" && (
          <Fragment>
            <Content>
              <div style="margin: auto; margin-top: 50px; margin-bottom: 0; text-align: center;">
              <Heading style="font-size: 15px" title="Follow these step by step instructions to create your Voice Compass journey."></Heading>
              </div>
              <div style="margin: auto; margin-top: 15px; margin-bottom: 0; text-align: center; width: 75%">
              <Heading style="font-size: 12px; color: #757575" title="You will be asked to do this for each design file you create in Figma."> </Heading>
              </div>
              <div>
                <button
                class="settings-primary"
                style="margin: auto; margin-top: 25px; font-size: 16px; height: 38px; width: 119px; border-radius: 9px; text-align: center; padding-left: 15px"
                onClick={() => {
                  setTab("change-token")
                }}
                >
                Get Started
                </button>
              </div>
            </Content>
          </Fragment>
          )}
        {tab === "change-token" && (
          <Fragment>
            <Content>
              <div style="margin: auto; width: 75%; height: 150%; margin-top: 0px;" class="font">
                <div style="margin: auto; margin-top: 0px; padding: 5px;">
                  <div class="font" style="text-align: left; margin-bottom: 25px; font-weight: bold; font-size: 15px;">Step 1:</div>
                  <div class="font" style="margin-left: 8px; font-size: 14px; color: #757575">
                    <p>— Right click on the Figma file tab you are working on.</p>
                    <p>— Select <span style="font-weight: bold">Copy Link</span></p>
                    <p>— Paste below and press "Save."</p>
                    <div class="startup-textbox">
                      <input 
                        class="input__field block w-full font b" 
                        style="position: relative; border: 1px solid var(--black1); height: 125%"
                        ref={linkRef}
                        value={pageLink}
                        >
                        </input>
                        <button
                        id="saveLink"
                        class="startup-button"
                        onClick={() => {
                            postMessage({
                              type: "set-link",
                              payload: linkRef.current.value,
                            })
                          } 
                        }
                        >
                        {linkSave}
                        </button>
                      </div>
                    </div>
                  </div>
                  <div style="margin: auto; margin-top: 0px; padding 5px;">
                    <div class="font" style="text-align: left; margin-bottom: 25px; font-weight: bold; font-size: 15px">Step 2: Generate Personal Access Token</div>
                    <div class="font" style="margin-left: 8px; font-size: 14px; color: #757575">
                      <p>— Head to your Account Settings from the top-left menu inside Figma.</p>
                      <p>— Scroll down to the <span style="font-weight: bold">Personal Access Token</span> section.</p>
                      <p>— Click <span style="font-weight: bold">Create New Token.</span></p>
                      <p>— A token will be generated. This will be your only chance to copy the token.</p>
                      <p>— Paste your token below and press "Save."</p>
                      <div class="startup-textbox" style="margin-left: 6px">
                      <input 
                        class="input__field block w-full font b" 
                        style="position: relative; border: 1px solid var(--black1); height: 125%"
                        ref={tokenRef}
                        value={accessToken}
                        >
                        </input>
                        <button
                        id="saveToken"
                        class="startup-button"
                        onClick={() => {
                          document.getElementById("saveToken").setAttribute('class','icon icon--check check-change')
                          setTokenSave("");
                            postMessage({
                              type: "set-token",
                              payload: tokenRef.current.value,
                            })
                          } 
                        }
                        >
                          {tokenSave}
                        </button>
                      </div>
                    </div>
                  </div>
                  <button
                  id="createJourneyBtn"
                  class="settings-primary"
                  style="margin: auto; margin-top: 35px; margin-bottom: 0; font-size: 15px; width: 140px; height: 40px; border-radius: 7px; padding-left: 15px"
                  onClick={() => {
                    document.getElementById("createJourneyBtn").setAttribute('class','settings-secondary');
                    postMessage({
                      type: "check-for-filled-inputs"
                    })
                  }}
                  >
                    {buttonText}
                  </button>
                </div>
                <div id="backBtn" style={`position: absolute; height: 35px; right: 2px; top: 0; margin: 0; padding: 0; border: none; visibility: ${buttonText === "Apply Changes" ? "visible" : "hidden"}`}>
                  <button
                  class="back-button underline"
                  style="position: absolute; bottom: 12px; right: 12px;"
                  onClick={() => {
                    setTab("settings");
                    setLinkSave("Save");
                    setTokenSave("Save");
                  }}
                  >
                    Back
                  </button>
                  <button
                  class="back-button"
                  style="transform: scale(.5,1); font-size: 20px"
                  >
                    {">"}
                  </button>
                </div>
            </Content>
          </Fragment>
        )}
      </div>
    </div>
  );
};

const LanguageSelect: FunctionComponent<{
  language: Language;
  setLanguage: (lang: Language) => void;
}> = (props) => {
  return (
    <select
      style="font-size: 11px; border: 1px solid var(--black1); border-radius: 2px; padding: 4px 5px;"
      value={props.language}
      onChange={(ev: any) => {
        props.setLanguage(ev.target.value);
      }}
    >
      {languages.map((language) => (
        <option value={language.value}>{language.label}</option>
      ))}
    </select>
  );
};


function DownloadBtn() {
  return (
        <div class="settings-box">
        <div class="settings-headers font">Save to Computer</div>
        <button
          id="downloadBtn"
          class="settings-secondary"
          onClick={() => {
            document.getElementById("downloadBtn").setAttribute('class','settings-primary');
            postMessage({
              type: "request-all-steps-for-download",
            });
          }}
        >
          Download
        </button>
      </div>
  );
}

const container = () => document.querySelector("#app");

// This needs to be async because script is inlined in <head> and not after the containter element is defined
setTimeout(() => {
  render(<App />, container());
});

const downloadContent = ({ filename, content }) => {
  const a = document.createElement("a");
  const href = window.URL.createObjectURL(
    new Blob([content], {
      type: "text/plain",
    })
  );
  a.setAttribute("href", href);
  a.setAttribute("download", filename);
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
  }, 150);
};

onmessage = (event: { data: { pluginMessage: PluginMessage } }) => {
  pluginStream.send(event.data.pluginMessage);


};

