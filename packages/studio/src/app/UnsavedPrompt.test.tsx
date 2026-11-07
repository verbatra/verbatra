// @vitest-environment jsdom
import { act } from "react";
import { describe, expect, it, vi } from "vitest";
import { click, render } from "./test-support.js";
import { UnsavedPrompt } from "./UnsavedPrompt.js";

function escapeKey(): KeyboardEvent {
  return new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true });
}

describe("UnsavedPrompt", () => {
  it("keeps Save, Discard and Keep editing as its default words", () => {
    const view = render(
      <UnsavedPrompt
        subject="x"
        saving={false}
        error={null}
        placement="pane"
        onSave={() => {}}
        onDiscard={() => {}}
        onKeepEditing={() => {}}
      />,
    );

    expect(view.all("button").map((button) => button.textContent)).toEqual([
      "Save",
      "Discard",
      "Keep editing",
    ]);
  });

  it("takes the words for what the actions do", () => {
    const onSave = vi.fn();
    const onDiscard = vi.fn();
    const view = render(
      <UnsavedPrompt
        subject="x"
        saving={false}
        error={null}
        placement="pane"
        saveLabel="Save draft, then restore"
        discardLabel="Discard draft and restore"
        onSave={onSave}
        onDiscard={onDiscard}
        onKeepEditing={() => {}}
      />,
    );

    click(view.getByText("button", "Save draft, then restore"));
    click(view.getByText("button", "Discard draft and restore"));

    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onDiscard).toHaveBeenCalledTimes(1);
  });

  it("leaves Escape to the layer below unless it was asked to keep editing on it", () => {
    const onKeepEditing = vi.fn();
    const below = vi.fn();
    document.addEventListener("keydown", below);
    const view = render(
      <UnsavedPrompt
        subject="x"
        saving={false}
        error={null}
        placement="pane"
        onDiscard={() => {}}
        onKeepEditing={onKeepEditing}
      />,
    );

    act(() => {
      document.activeElement?.dispatchEvent(escapeKey());
    });

    expect(below).toHaveBeenCalledTimes(1);
    expect(onKeepEditing).not.toHaveBeenCalled();

    view.rerender(
      <UnsavedPrompt
        subject="x"
        saving={false}
        error={null}
        placement="pane"
        escapeKeepsEditing
        onDiscard={() => {}}
        onKeepEditing={onKeepEditing}
      />,
    );
    act(() => {
      document.activeElement?.dispatchEvent(escapeKey());
    });
    document.removeEventListener("keydown", below);

    expect(onKeepEditing).toHaveBeenCalledTimes(1);
    expect(below).toHaveBeenCalledTimes(1);
  });

  it("ignores Escape while a save runs", () => {
    const onKeepEditing = vi.fn();
    render(
      <UnsavedPrompt
        subject="x"
        saving
        error={null}
        placement="pane"
        escapeKeepsEditing
        onDiscard={() => {}}
        onKeepEditing={onKeepEditing}
      />,
    );

    act(() => {
      document.activeElement?.dispatchEvent(escapeKey());
    });

    expect(onKeepEditing).not.toHaveBeenCalled();
  });
});
