/*var c=0;
var x;
var y;*/
// Types

type Language = "en-US" | "en-AU" | "es-419" | "es-ES" | "fr-CA" | "pt-BR";

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
  linksTo?: string[];
  canvasX?: number;
  canvasY?: number;
  end?: boolean;
  escalate?: boolean;
  automate?: boolean;
  imageKey?: string;
}

type UiMessage =
  | { type: "set-step-on-selection"; payload: null | Step }
  | { type: "set-step"; payload: { key: string; step: Step } }
  | { type: "delete-step"; payload: string }
  | { type: "select-step"; payload: string }
  | { type: "request-all-steps-for-download" }
  | { type: "request-all-steps" }
  | { type: "send-flow"; payload: { data: Array<{ TNID: string, ID: string }>; type: string } }
  | { type: "gather-json"; }
  | { type: "get-groups"; }
  | { type: "add-to-groups"; payload: string }
  | { type: "set-to-new-group"; payload: string; }
  | { type: "delete-group"; payload: string }
  | { type: "set-token"; payload: string }
  | { type: "set-link"; payload: string }
  | { type: "check-for-filled-inputs" }
  | { type: "send-uuid"; payload: { UUID: string; ID: string } }
  | { type: "error-message"; payload: string }
  | { type: "evaluate-response"; }
  | { type: "set-name" }

type PluginMessage =
  | {
    type: "selection";
    payload: null | { name: string; step: null | Step; };
  }
  | { type: "all-steps-for-download"; payload: Array<Step> }
  | { type: "all-steps"; payload: Array<Step> }
  | { type: "get-flow"; payload: { linkSeg: string; token: string; pageNodeID: string; type: string } }
  | { type: "generate-link"; payload: Array<Step> }
  | { type: "send-groups"; payload: string[] }
  | { type: "startup"; payload: null | string }
  | { type: "has-filled-inputs"; }
  | { type: "new-uuid"; payload: string }
  | { type: "set-token-and-url"; payload: { url: string; token: string }; }
  | { type: "test-api-req"; payload: { url: string; token: string }; }
  | { type: "set-to-saved"; payload: string }
  | { type: "change-to-primary"; }

// Show modal

figma.showUI(__html__, {
  width: 520,
  height: 500,
});

//onDownload functions

//prepping to call figma API to retrieve linksTo data
const getFlowData = (type: string) => {
  figma.clientStorage.getAsync("token").then(response => {
    postPluginMessage({
      type: 'get-flow',
      payload: {
        linkSeg: figma.root.getPluginData("link"),
        token: response,
        pageNodeID: figma.currentPage.id,
        type: type,
      }
    })
  })
}

//iterates through nodes and sets canvasX and canvasY w/ scaling
const checkCoords = () => {
  let haveRefNode: boolean = false;
  let refNodeX: number;
  let refNodeY: number;

  traverseNodes((node) => {
    if (node.type !== "PAGE" && node.getPluginData("step")) {
      if (!haveRefNode) {
        refNodeX = node.x;
        refNodeY = node.y;
        haveRefNode = true;
      }
      const step = parseStep(node.getPluginData("step"));

      if (node.parent.type === "FRAME") {
        node.setPluginData("step", JSON.stringify({
          ...step,
          canvasX: applyScaleX(node.parent.x + node.x, refNodeX),
          canvasY: applyScaleY(node.parent.y - node.y, refNodeY)
        }))
      } else {
        node.setPluginData("step", JSON.stringify({
          ...step,
          canvasX: applyScaleX(node.x, refNodeX),
          canvasY: applyScaleY(node.y, refNodeY)
        }))
      }
    }
  }, figma.currentPage);
}

//iterates through nodes and makes sure there are no duplicate keys
const checkForDuplicateKeys = () => {
  let keysAndIDS: Array<{ key: string, ID: string }> = [];
  const keys = new Set();
  let duplicates: Array<{ key: string, ID: string }> = [];

  traverseNodes((node) => {
    if (node.getPluginData("step")) {
      const step = parseStep(node.getPluginData("step"));
      keysAndIDS.push({
        key: step.key,
        ID: node.id,
      })
    }
  }, figma.currentPage);

  keysAndIDS.forEach((step) => {
    if (keys.has(step.key)) {
      duplicates.push({ key: step.key, ID: step.ID });
    }
    keys.add(step.key);
  });

  duplicates.forEach(function (step) {
    postPluginMessage({
      type: "new-uuid",
      payload: step.ID,
    })
  })
}

// Helpers

//parses JSON
const parseStep = (value: any): Step | null => {
  try {
    const json = JSON.parse(value);
    if (!json || !json.key || typeof json.body !== "string") {
      throw new Error("Cannot parse step");
    }
    return {
      ...json,
      i18n: json.i18n || {},
    };
  } catch {
    return null;
  }
};

//returns the pluginData for the selected node
const getSelectionInfo = () => {
  const [node] = figma.currentPage.selection;
  if (node) {
    return {
      name: node.name,
      step: parseStep(node.getPluginData("step")),
    };
  }
  return null;
};

//traverses nodes an applies a passed function
const traverseNodes = (
  fn: (node: SceneNode | PageNode) => void,
  node: SceneNode | PageNode
): void => {
  fn(node);

  if ("children" in node) {
    node.children.forEach((child) => {
      traverseNodes(fn, child);
    });
  }
};

//traverses steps
const traverseSteps = (node: SceneNode | PageNode): Array<Step> => {
  const step = parseStep(node.getPluginData("step"));

  const base = step ? [step] : [];

  if ("children" in node) {
    return [
      ...base,
      ...node.children
        .map(traverseSteps)
        .reduce((current, accumulator) => [...current, ...accumulator], []),
    ];
  } else {
    return base;
  }
};

//returns json of all step data
const getAllSteps = () => {
  return traverseSteps(figma.currentPage);
};

//post a message that gets picked up by UI
const postPluginMessage = (msg: PluginMessage) => {
  figma.ui.postMessage(msg);
};

//sends current selection's pluginData to front end
const sendSelection = () => {
  sendGroups();
  postPluginMessage({
    type: "selection",
    payload: getSelectionInfo(),
  });
  //console.log(getSelectionInfo());
};

//test if update info

//checks if the step name = the node name, and if not, it updates the step's name and description
const testForUpdate = () => {
  const [node] = figma.currentPage.selection;

  if (node) {

    if (node.getPluginData("step")) {
      const step = parseStep(node.getPluginData("step"));

      if (step.name !== node.name) {
        const now = new Date();
        node.setPluginData("step", JSON.stringify({
          ...step,
          name: node.name,
          description: `${node.name} / set by Figma plugin at ${now.toLocaleString()} (${now.getTimezoneOffset()})`
        }))
      }
    }
  }
}

//coordinates conversion

const applyScaleX = (coord: number, ref: number) => {
  return (coord - ref) / 220;
}

const applyScaleY = (coord: number, ref: number) => {
  return (coord - ref) / 340;
}


//Group property helpers
//the array of groups is stored in figma PageNode's plugin data. It is a concatinated string separated by &'s

//sends groups to front end and adds the Main group if it doesn't yet exist
const sendGroups = () => {
  const page = figma.currentPage;
  let arr: string = page.getPluginData("groupArr")
  if (!hasMain(arr)) {
    if (arr === '') {
      arr = "Main";
    } else {
      arr = "Main&" + arr;
    }
  }
  postPluginMessage({
    type: "send-groups",
    payload: arr.split("&")
  })
}

//checks if group array has Main in it
const hasMain = (arr: string) => {
  const groupArr: string[] = arr.split("&");
  groupArr.forEach(function (e) {
    if (e === "Main") {
      return true;
    }
  })
  return false;
}

// Startup scripts

//checks if user has stored their page url or access token, and if not, brings them to the get-started tab
const initiateStartup = () => {
  figma.clientStorage.getAsync("token").then(response => {
    if (figma.root.getPluginData('valid') !== "true" || !response) {
      postPluginMessage({ type: "startup", payload: response })
    } else {
      postPluginMessage({       //necessary for autofill (i.e. sets the useState of the url and token)
        type: "set-token-and-url",
        payload: {
          url: figma.root.getPluginData("original-link"),
          token: response,
        }
      })
    }
  })
};


setTimeout(() => {
  sendSelection();
}, 500);

//timeout necessary so front end has a chance to load
figma.on("run", () => setTimeout(initiateStartup, 400))

figma.on("selectionchange", testForUpdate);

figma.on("selectionchange", sendSelection);

figma.ui.onmessage = (msg: UiMessage) => {

  //turns a node into step when Create Node button is pressed
  if (msg.type === "set-step-on-selection") {
    const [node] = figma.currentPage.selection;
    const now = new Date();
    if (node) {
      node.name = msg.payload.name;

      node.setPluginData(
        "step",
        JSON.stringify({
          ...msg.payload,
          description: `${node.name
            } / set by Figma plugin at ${now.toLocaleString()} (${now.getTimezoneOffset()})`,
          lastUpdated: now.getTime(),
        })
      );
      sendSelection();
    }
  }

  //updates step info when input fields are modified
  if (msg.type === "set-step") {
    let nodesChanged = 0;
    traverseNodes((node) => {
      const step = parseStep(node.getPluginData("step"));
      if (step?.key === msg.payload.key && nodesChanged === 0) {
        nodesChanged++;
        node.setPluginData(
          "step",
          JSON.stringify({
            ...msg.payload.step,
            lastUpdated: new Date().getTime(),
          })
        );
        node.name = msg.payload.step.name;
        postPluginMessage({
          type: "all-steps",
          payload: getAllSteps(),
        });
        sendSelection();
      }
    }, figma.currentPage);
  }

  //sets step data is an empty string
  if (msg.type === "delete-step") {
    traverseNodes((node) => {
      const step = parseStep(node.getPluginData("step"));
      if (step?.key === msg.payload) {
        node.setPluginData("step", "");
        postPluginMessage({
          type: "all-steps",
          payload: getAllSteps(),
        });
        sendSelection();
      }
    }, figma.currentPage);
  }

  //chooses the correct step based on the passed key
  if (msg.type === "select-step") {
    traverseNodes((node) => {
      const step = parseStep(node.getPluginData("step"));
      if (step?.key === msg.payload) {
        figma.currentPage.selection = [node] as Array<SceneNode>;
      }
    }, figma.currentPage);
  }

  //on Download event 
  if (msg.type === "request-all-steps-for-download") {
    checkCoords();
    checkForDuplicateKeys();
    getFlowData("download");
  }

  //sends json of all steps to front end
  if (msg.type === "request-all-steps") {
    postPluginMessage({
      type: "all-steps",
      payload: getAllSteps(),
    });
  }

  //assigns the linksTo data based on the API data received from the front end
  if (msg.type === "send-flow") {
    const flows: Array<{ TNID: string, ID: string }> = msg.payload.data;

    let exists: boolean;

    flows.forEach(function (e) {  //traverse flows array
      const node: BaseNode = figma.getNodeById(e.ID);    //node that's being given linksTo value

      const linksToNode: BaseNode = figma.getNodeById(e.TNID);    //node that the prior node is linked to

      if (node.getPluginData("step") && linksToNode.getPluginData("step")) {    //checking if both nodes are steps
        exists = false;
        const step = parseStep(node.getPluginData("step"));

        const linksToNodeKey: string = parseStep(linksToNode.getPluginData("step")).key;    //the step key of linksToNode

        let updatedLinksTo: string[] = step.linksTo;    //instantiating the current linksTo array in the node step data

        if (typeof updatedLinksTo === 'string') {   //error handling
          updatedLinksTo = [updatedLinksTo]
        }
        if (typeof updatedLinksTo !== 'undefined') {    //error handling
          updatedLinksTo.forEach((element) => {   //checks if the linksTo key already exists on node
            if (element === linksToNodeKey) {
              //updatedLinksTo.splice(updatedLinksTo.indexOf(element));
              exists = true;
            }
          });
          if (!exists) {
            updatedLinksTo.push(linksToNodeKey);    //adding the new step key
            node.setPluginData("step", JSON.stringify({
              ...step,
              linksTo: updatedLinksTo,    //setting the linksTo to the updated linksTo
            }))
          }
        } else {
          const temp: string[] = [linksToNodeKey]
          node.setPluginData("step", JSON.stringify({
            ...step,
            linksTo: temp,
          }))
        }
      }
    })
    if (msg.payload.type === "json") {
      postPluginMessage({
        type: "generate-link",
        payload: getAllSteps(),
      })
    } else if (msg.payload.type === "download") {
      postPluginMessage({
        type: "all-steps-for-download",
        payload: getAllSteps(),
      });
    }
  }

  //on Download function2
  if (msg.type == "gather-json") {
    checkCoords();
    checkForDuplicateKeys();
    getFlowData("json");
  }

  //concats an additional group to the PageNode pluginData
  if (msg.type === "add-to-groups") {
    const page = figma.currentPage;
    let arr: string = page.getPluginData("groupArr")
    if (arr.length !== 0) {
      arr += "&" + msg.payload
    } else {
      arr = msg.payload;
    }

    page.setPluginData("groupArr", arr)

    sendGroups();
  }

  //sends groups to front end
  if (msg.type === "get-groups") {
    sendGroups();
  }

  //updates a node's group assignment
  if (msg.type === "set-to-new-group") {
    const [node] = figma.currentPage.selection;
    const step = parseStep(node.getPluginData("step"))
    node.setPluginData("step",
      JSON.stringify({
        ...step,
        group: msg.payload,
      }))
    postPluginMessage({
      type: "selection",
      payload: getSelectionInfo(),
    })
  }

  //removes a group from the PageNode's plugin data
  if (msg.type === "delete-group") {
    const page = figma.currentPage;
    let arr: string = page.getPluginData("groupArr");
    let arr2: string[] = arr.split("&")
    for (let i = 0; i < arr2.length; i++) {
      if (arr2[i] === msg.payload) {
        arr2.splice(i, 1)
      }
    }

    traverseNodes((node) => {
      if (node.getPluginData("step")) {
        const step = parseStep(node.getPluginData("step"));
        if (step.group === msg.payload) {
          node.setPluginData("step", JSON.stringify({
            ...step,
            group: "Main",
          }))
        }
      }
    }, figma.currentPage)

    arr = arr2.join("&");
    page.setPluginData("groupArr", arr)

    postPluginMessage({
      type: "selection",
      payload: getSelectionInfo(),
    })
  }

  //adds the figma token to the client's local storage
  if (msg.type === "set-token") {
    figma.clientStorage.setAsync("token", msg.payload)

  }

  //takes the link and extracts the part needed for API requests, then sets the pluginData
  if (msg.type === "set-link") {
    figma.root.setPluginData("original-link", msg.payload);
    const len: number = msg.payload.length;
    const link: string = msg.payload;
    let str: string = "";
    let done: boolean = false;
    let fileIndex: number = msg.payload.indexOf("file") + 5;
    if (fileIndex === 4) {
      figma.notify("Please enter a valid link", { timeout: 4000, error: true })
    } else {
      while (!done && fileIndex < len) {
        if (link.charAt(fileIndex) === "/") {
          done = true;
        } else {
          str += link.charAt(fileIndex)
        }
        fileIndex++;
      }
      if (fileIndex === len) {
        figma.notify("Please enter a valid link", { timeout: 4000, error: true })
      } else {
        postPluginMessage({
          type: "set-to-saved",
          payload: figma.root.getPluginData("original-link"),
        })
        figma.root.setPluginData("link", str)
      }
    }
  }

  //checks if the users token and url fields are filled in (arbitrarily)
  if (msg.type === "check-for-filled-inputs") {

    figma.clientStorage.getAsync("token").then(response => {
      const linkData: string = figma.root.getPluginData("link");
      if (response && linkData) {
        postPluginMessage({
          type: "test-api-req",
          payload: {
            url: linkData,
            token: response
          }
        })
      } else {
        figma.notify("Please complete all fields", { timeout: 4000, error: true });
        postPluginMessage({
          type: "change-to-primary"
        })
      }
    })
  }


  if (msg.type === "evaluate-response") {
    figma.root.setPluginData('valid', "true");
    postPluginMessage({
      type: "has-filled-inputs",
    })
  }

  //assigns a new key to to a given node
  if (msg.type === "send-uuid") {
    const node = figma.getNodeById(msg.payload.ID);
    node.setPluginData("step", JSON.stringify({
      ...parseStep(node.getPluginData("step")),
      key: msg.payload.UUID,
    }))
  }

  //general method for creating notify messages
  if (msg.type === "error-message") {
    figma.notify(msg.payload, { timeout: 4000, error: true })
  }

  if (msg.type === "set-name") {
    const [node] = figma.currentPage.selection;
    const step = parseStep(node.getPluginData("step"));

    node.setPluginData("step", JSON.stringify({
      ...step,
      name: node.name,
    }))


  }
};
