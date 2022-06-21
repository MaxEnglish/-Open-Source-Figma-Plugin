import { h, Fragment, render, FunctionComponent } from "preact";
import { useState, useRef, useEffect, useMemo } from "preact/hooks";
import { v4 as uuid } from "uuid";
import Fuse from "fuse.js";
import {
  Input,
  LastUpdated,
  IconButton,
  Empty,
  Content,
  Heading,
  OnboardingTip,
} from "./ui/kit";

type UiMessage =
  | { type: "set-step-on-selection"; payload: null | Step }
  | { type: "set-step"; payload: { key: string; step: Step } }
  | { type: "delete-step"; payload: string }
  | { type: "select-step"; payload: string }
  | { type: "select-all" }
  | { type: "select-duplicates" }
  | { type: "request-all-steps-for-download" }
  | { type: "request-all-steps" };

type PluginMessage =
  | {
      type: "selection";
      payload: null | { name: string; step: null | Step };
    }
  | { type: "all-steps-for-download"; payload: Array<Step> }
  | { type: "all-steps"; payload: Array<Step> };

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
    linksTo?: Array<string>;
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
}> = ({ value, error, onSelect, onChange, onDelete, language }) => {
  return (
    <div class="space-y-1">
      <div class="flex space-x-1">
        <PlayButton
          transcript={
            language === defaultLanguage
              ? value.body
              : value.i18n[language] && value.i18n[language].body
          }
          language={language}
        />
        <IconButton
          icon="reverse"
          title="Regenerate key"
          onClick={() => {
            onChange({
              ...value,
              key: uuid(),
            });
          }}
        />
        <div class="space-y-1" style="flex: 1">
          <Input
            label="Key"
            value={value.key}
            placeholder="Step key (use the generate icon on the left)"
            onChange={(newVal: string) => {
              onChange({
                ...value,
                key: newVal,
              });
            }}
            selectAll
            disabled
          />

          <Input
            label="Transcript"
            multiline
            value={
              language === defaultLanguage
                ? value.body
                : value.i18n[language]
                ? value.i18n[language].body
                : ""
            }
            onChange={(newVal: string) => {
              onChange({
                ...value,
                ...(language === defaultLanguage
                  ? { body: newVal }
                  : {
                      i18n: { ...value.i18n, [language]: { body: newVal } },
                    }),
              });
            }}
          />
        </div>
        {onSelect && (
          <IconButton icon="frame" title="Select step" onClick={onSelect} />
        )}

        {onDelete && (
          <IconButton icon="trash" title="Delete step" onClick={onDelete} />
        )}
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
  icon: string;
  active?: boolean;
  onClick?: () => void;
}> = (props) => (
  <button
    onClick={props.onClick}
    class={`icon icon--${props.icon}`}
    style={`border: 0; cursor: pointer; background-color: ${
      props.active ? "#f5f5f5" : "#fff"
    }`}
  ></button>
);

const App: FunctionComponent<{}> = () => {
  const [language, setLanguage] = useState<Language>(defaultLanguage);

  const [tab, setTab] = useState<"frame" | "list-detailed" | "settings">(
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

  const duplicateKeys = useMemo(() => {
    const keys = new Set();
    const duplicates = new Set();
    steps.forEach((step) => {
      if (keys.has(step.key)) {
        duplicates.add(step.key);
      }
      keys.add(step.key);
    });
    return duplicates;
  }, [steps]);

  useEffect(() => {
    const handlePluginMsg = (msg: PluginMessage) => {
      if (msg.type === "selection") {
        setSelection(msg.payload);
      } else if (msg.type === "all-steps-for-download") {
        downloadContent({
          filename: "Journey.json",
          content: JSON.stringify(msg.payload, null, 2),
        });
      } else if (msg.type === "all-steps") {
        setSteps(msg.payload);
      }
    };
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

  const searchedSteps: Array<Step> = useMemo(
    () =>
      search.trim()
        ? new Fuse(steps, {
            keys: [
              "key",
              "body",
              ...languages.map((language) => `i18n.${language.value}.body`),
            ],
          })
            .search(search)
            .map((item) => item.item)
        : steps,
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
            <p>
              <small>{confirm.body}</small>
            </p>
            <div class="flex space-x-2 justify-end">
              <button
                class="button button--tertiary bg-none"
                onClick={() => {
                  setConfirm(null);
                }}
              >
                Cancel
              </button>
              <button
                class="button button--primary"
                onClick={() => {
                  confirm.onConfirm();
                  setConfirm(null);
                }}
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}
      <div class="sidebar flex-none" style="border-right: 1px solid #dedede;">
        <SidebarButton
          icon="frame"
          active={tab === "frame"}
          onClick={() => {
            setTab("frame");
          }}
        />
        <SidebarButton
          icon="list-detailed"
          active={tab === "list-detailed"}
          onClick={() => {
            setTab("list-detailed");
          }}
        />
        <SidebarButton
          icon="settings"
          active={tab === "settings"}
          onClick={() => {
            setTab("settings");
          }}
        />
      </div>
      <div style="height: 100%; overflow: auto; flex: 1">
        {tab === "frame" && (
          <Fragment>
            <Heading title="Voice Assistant Step">
              <LanguageSelect language={language} setLanguage={setLanguage} />
            </Heading>
            <Content>
              {selection ? (
                <Fragment>
                  <OnboardingTip body={selection.name} icon={"frame"} />
                  {selection.step?.lastUpdated && (
                    <LastUpdated lastUpdated={selection.step?.lastUpdated} />
                  )}
                  {!selection.step && (
                    <p style="margin: 0">
                      <small style="color: #9a9a9a; padding-left: 40px;">
                        No step available
                      </small>
                    </p>
                  )}
                </Fragment>
              ) : null}
              {selection ? (
                selection.step ? (
                  <StepEditor
                    language={language}
                    value={selection.step}
                    onChange={(newStep: Step) => {
                      postMessage({
                        type: "set-step-on-selection",
                        payload: newStep,
                      });
                    }}
                    onDelete={() => {
                      setConfirm({
                        body:
                          "You are about to delete this step for all languages. This is irreversible. If you would like to delete for one language only, simply clear the input field. Are you sure?",
                        onConfirm: () => {
                          postMessage({
                            type: "set-step-on-selection",
                            payload: null,
                          });
                        },
                      });
                    }}
                  />
                ) : (
                  <button
                    class="button button--primary"
                    onClick={() => {
                      postMessage({
                        type: "set-step-on-selection",
                        payload: {
                          key: uuid(),
                          body: "Transcript",
                          name: "",
                          i18n: {} as I18n,
                          group: "",
                          trigger: null,
                          linksTo: [],
                          canvasX: 0,
                          canvasY: 0,
                          end: false,
                          escalate: false,
                          automate: false,
                          imageKey: ""
                        },
                      });
                    }}
                  >
                    Create step
                  </button>
                )
              ) : (
                <Empty />
              )}
            </Content>
          </Fragment>
        )}
        {tab === "list-detailed" && (
          <Fragment>
            <Heading title="All transcripts">
              <LanguageSelect language={language} setLanguage={setLanguage} />
            </Heading>
            <Content>
              <Input
                value={search}
                onChange={setSearch}
                placeholder="Search entries"
              />
              <div class="space-y-2">
                {searchedSteps.map((step, index) => (
                  <StepEditor
                    key={index}
                    value={step}
                    onChange={(newStep) => {
                      postMessage({
                        type: "set-step",
                        payload: { key: step.key, step: newStep },
                      });
                    }}
                    onDelete={() => {
                      setConfirm({
                        body:
                          "You are about to delete this step for all languages. This is irreversible. If you would like to delete for one language only, simply clear the input field. Are you sure?",
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
                    }}
                    error={
                      duplicateKeys.has(step.key)
                        ? `There is another instance of ${step.key} in your document. Please change one of these keys using the generate function to the left of the key.`
                        : undefined
                    }
                    language={language}
                  />
                ))}
              </div>
            </Content>
          </Fragment>
        )}
        {tab === "settings" && (
          <Fragment>
            <Heading title="Settings"></Heading>
            <Content>
              <Settings />
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

function Settings() {
  return (
    <div class="space-y-2">
      <div class="flex space-x-2">
        <button
          class="button button--primary"
          onClick={() => {
            postMessage({
              type: "request-all-steps-for-download",
            });
          }}
        >
          Download all
        </button>
        <button
          class="button button--tertiary bg-none"
          onClick={() => {
            postMessage({
              type: "select-duplicates",
            });
          }}
        >
          Show duplicate steps
        </button>
        <button
          class="button button--tertiary bg-none"
          onClick={() => {
            postMessage({
              type: "select-all",
            });
          }}
        >
          Show all steps
        </button>
      </div>
    </div>
  );
}

const exampleSelection: { name: string; step: Step } = {
  name: "Node",
  step: {
    key: "1234",
    body: "Hello",
    lastUpdated: "1608296433244",
    i18n: {} as I18n,
  },
};

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
