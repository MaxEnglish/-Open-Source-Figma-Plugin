import { h, FunctionComponent } from "preact";
import { formatDistance } from "date-fns";
import { useRef } from "preact/hooks";

export const Empty: FunctionComponent<{}> = () => (
  <OnboardingTip
    title="Please click on a frame to show available nodes"
    body="No frames are selected"
    icon="minus"
  />
);

export const Heading: FunctionComponent<{
  title: string;
  style?: string;
}> = (props) => (
  <div class="flex px-2 py-3">
    <h2 class="headers font" style={props.style}>
      {props.title}
    </h2>
    {props.children}
  </div>
);

export function OnboardingTip({ body, icon, title = "" }) {
  if (title !== "") {
    return (
      <div style="text-align: center; margin-top: 60px">
        <div class="onboarding-tip__msg font" style="color: #242424; font-size: 15px">{title}</div>
        <div class="onboarding-tip font" style="margin-left: 28%;">
          <div class={`icon icon--black8 icon--${icon || "styles"} font`} />
          <div class="font" style="color: #757575; padding: var(--size-xxsmall) 0 var(--size-xxsmall) 0; font-size: 15px; letter-spacing: var(--font-letter-spacing-pos-xsmall); line-height: var(--line-height); margin: 0;">{body}</div>
        </div>
      </div>
    )
  } else {
    return (
      <div class="onboarding-tip font">
        <div class={`icon icon--black8 icon--${icon || "styles"} font`} />
        <div class="onboarding-tip__msg font" style="font-size: 15px">{body}</div>
      </div>
    )
  }

}

export const Content: FunctionComponent<{}> = (props) => (
  <div class="px-2 space-y-2" style="padding-bottom: 16px">
    {props.children}
  </div>
);

export const HasHeaders: FunctionComponent<{
  header?: string;
  mode: boolean;
}> = (props) => {
  if (props.mode && props.header) {
    return (
      <div class="font" style="font-size: 13px;; color: #757575">{props.header}</div>
    )
  }
}

export const Input: FunctionComponent<{
  value: string;
  onChange?: (newValue: string) => void;
  placeholder?: string;
  label?: string;
  disabled?: boolean;
  selectAll?: boolean;
  multiline?: boolean;
}> = (props) => {
  const inputRef = useRef<any>();
  const commonProps = {
    ref: inputRef,
    value: props.value,
    placeholder: props.placeholder,
    onFocus: () => {
      if (inputRef.current && props.selectAll) {
        inputRef.current.select();
      }
    },
    onInput: (ev) => {
      props.onChange(ev.target.value || "");
    },
  };
  return (
    <div class="input block w-full b">
      {!props.multiline ? (
        <input
          type="text"
          {...commonProps}
          class="input__field block w-full b"
          style="border: 1px solid var(--black1); color: #353230; font-size: 13px"
        />
      ) : (
        <textarea {...commonProps} class="textarea1 b" style="color: #353230; font-size: 13px; border-radius: 2px" rows={5} type="text" />
      )}
    </div>
  );
};

export const ErrorDot: FunctionComponent<{}> = () => <div class="error-dot" />;

export const LastUpdated: FunctionComponent<{ lastUpdated: any }> = (props) => (
  <small style="color: #9a9a9a; padding-left: 40px;">
    {`Last updated: ${formatDistance(
      new Date(),
      new Date(props.lastUpdated)
    )} ago.`}
  </small>
);

export const IconButton: FunctionComponent<{
  icon: "trash" | "close" | "play" | "frame" | "hyperlink";
  title?: string;
  error?: boolean;
  onClick?: () => void;
}> = (props) => {
  return (
    <div
      class="icon-button a"
      onClick={props.onClick}
      title={props.title}
      style="position: relative"
    >
      <div class={`icon icon--${props.icon}`} />
      {props.error ? <ErrorDot /> : null}
    </div>
  );
};
