import { h, FunctionComponent } from "preact";
import { formatDistance } from "date-fns";
import { useRef } from "preact/hooks";

export const Empty: FunctionComponent<{}> = () => (
  <OnboardingTip
    body="Please select a node to see available transcripts."
    icon="minus"
  />
);

export const Heading: FunctionComponent<{
  title: string;
}> = (props) => (
  <div class="flex px-2 py-3">
    <h2 class="section-title" style="margin: 0">
      {props.title}
    </h2>
    {props.children}
  </div>
);

export function OnboardingTip({ body, icon }) {
  return (
    <div class="onboarding-tip">
      <div class={`icon icon--${icon || "styles"}`} />
      <div class="onboarding-tip__msg">{body}</div>
    </div>
  );
}

export const Content: FunctionComponent<{}> = (props) => (
  <div class="px-2 space-y-2" style="padding-bottom: 16px">
    {props.children}
  </div>
);

export const Input: FunctionComponent<{
  value: string;
  onChange: (newValue: string) => void;
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
    placeholder: props.placeholder || "Voice transcript (plain text or SSML)",
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
    <div class="input block w-full">
      {!props.multiline ? (
        <input
          {...commonProps}
          class="input__field block w-full"
          style="border: 1px solid var(--black1)"
        />
      ) : (
        <textarea {...commonProps} class="textarea" rows={5} />
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
  icon: "trash" | "reverse" | "close" | "play" | "frame";
  title?: string;
  error?: boolean;
  onClick?: () => void;
}> = (props) => {
  return (
    <div
      class="icon-button"
      onClick={props.onClick}
      title={props.title}
      style="position: relative"
    >
      <div class={`icon icon--${props.icon}`} />
      {props.error ? <ErrorDot /> : null}
    </div>
  );
};
