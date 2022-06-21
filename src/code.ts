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
  linksTo?: Array<string>;
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

// Show modal

figma.showUI(__html__, {
  width: 520,
  height: 440,
});

// Helpers

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

const findAnnotated = (
  node: SceneNode | PageNode
): Array<SceneNode | PageNode> => {
  const step = parseStep(node.getPluginData("step"));

  const base = step ? [node] : [];

  if ("children" in node) {
    return [
      ...base,
      ...node.children
        .map(findAnnotated)
        .reduce((current, accumulator) => [...current, ...accumulator], []),
    ];
  } else {
    return base;
  }
};

type GroupedByIds = Record<string, Array<SceneNode | PageNode>>;

const groupByKeys = (
  node: SceneNode | PageNode,
  prevGroup?: GroupedByIds
): GroupedByIds => {
  const step = parseStep(node.getPluginData("step"));

  const currentGroup: GroupedByIds = {
    ...(prevGroup || {}),
    ...(step
      ? {
          [step.key]:
            prevGroup && prevGroup[step.key]
              ? [...prevGroup[step.key], node]
              : [node],
        }
      : {}),
  };

  if ("children" in node) {
    return node.children.reduce(
      (runningGroup, node) => groupByKeys(node, runningGroup),
      currentGroup
    );
  } else {
    return currentGroup;
  }
};

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

const getAllSteps = () => {
  return traverseSteps(figma.currentPage);
};

const postPluginMessage = (msg: PluginMessage) => {
  figma.ui.postMessage(msg);
};

const sendSelection = () => {
  postPluginMessage({
    type: "selection",
    payload: getSelectionInfo(),
  });
  console.log(getSelectionInfo());
};

// Startup scripts

setTimeout(() => {
  sendSelection();
}, 500);

figma.on("selectionchange", sendSelection);


figma.ui.onmessage = (msg: UiMessage) => {
  //creating a new step when selecting new object and pressing "create step"
  if (msg.type === "set-step-on-selection") {
    //console.log("YOU'VE MADE A SELECTION!")
    const [node] = figma.currentPage.selection;
    const now = new Date();
    if (node) {
      node.setPluginData(
        "step",
        JSON.stringify({
          ...msg.payload,
          description: `${
            node.name
          } / set by Figma plugin at ${now.toLocaleString()} (${now.getTimezoneOffset()})`,
          lastUpdated: now.getTime(),
            name: node.name,
            canvasX:  node.x, 
            canvasY: node.y,
        })
      );
      sendSelection();
    }
  }

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
        postPluginMessage({
          type: "all-steps",
          payload: getAllSteps(),
        });
        sendSelection();
      }
    }, figma.currentPage);
  }

  if (msg.type === "delete-step") {
    traverseNodes((node) => {
      const step = parseStep(node.getPluginData("step"));
      if (step?.key === msg.payload) {
        node.setPluginData("step", "null");
        postPluginMessage({
          type: "all-steps",
          payload: getAllSteps(),
        });
        sendSelection();
      }
    }, figma.currentPage);
  }

  if (msg.type === "select-step") {
    traverseNodes((node) => {
      const step = parseStep(node.getPluginData("step"));
      if (step?.key === msg.payload) {
        figma.currentPage.selection = [node] as Array<SceneNode>;
      }
    }, figma.currentPage);
  }

  if (msg.type === "request-all-steps-for-download") {
    postPluginMessage({
      type: "all-steps-for-download",
      payload: getAllSteps(),
    });
  }

  if (msg.type === "request-all-steps") {
    postPluginMessage({
      type: "all-steps",
      payload: getAllSteps(),
    });
  }

  if (msg.type === "select-all") {
    figma.currentPage.selection = findAnnotated(
      figma.currentPage
    ) as Array<SceneNode>;
  }

  if (msg.type === "select-duplicates") {
    const grouped = groupByKeys(figma.currentPage);

    figma.currentPage.selection = Object.values(grouped).reduce(
      (accumulator, current) => [
        ...accumulator,
        ...(current.length > 1 ? current : []),
      ],
      []
    ) as Array<SceneNode>;
  }

  // figma.closePlugin();
};
