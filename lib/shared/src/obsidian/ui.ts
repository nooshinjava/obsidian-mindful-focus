import { Modal, Notice, Setting, type App, type ButtonComponent } from "obsidian";

/** Logs the error and shows a short notice instead of failing silently. */
export function notifyError(context: string, error: unknown): void {
  console.error(`[OrbitKit] ${context}`, error);
  const reason = error instanceof Error ? error.message : String(error);
  new Notice(`${context}: ${reason}`);
}

/**
 * Wraps async work started from a click/keyboard handler so a failure becomes
 * a visible notice rather than an unhandled promise rejection.
 */
export function handleAsync(context: string, task: () => Promise<unknown>): () => void {
  return () => {
    task().catch((error: unknown) => notifyError(context, error));
  };
}

export interface ChipOption<T extends string> {
  id: T;
  label: string;
}

/**
 * A row of toggle buttons where exactly one option is selected. Uses real
 * buttons with aria-pressed so it works with the keyboard and screen readers.
 */
export function createChipGroup<T extends string>(
  parent: HTMLElement,
  options: readonly ChipOption<T>[],
  selected: T,
  onSelect: (id: T) => void,
  ariaLabel: string,
): HTMLElement {
  const group = parent.createDiv({ cls: "orbitkit-chips", attr: { role: "group", "aria-label": ariaLabel } });
  const buttons: HTMLButtonElement[] = [];
  for (const option of options) {
    const button = group.createEl("button", { cls: "orbitkit-chip", text: option.label, attr: { type: "button" } });
    const setPressed = (pressed: boolean) => {
      button.toggleClass("is-selected", pressed);
      button.setAttr("aria-pressed", String(pressed));
    };
    setPressed(option.id === selected);
    button.addEventListener("click", () => {
      buttons.forEach((other) => {
        other.removeClass("is-selected");
        other.setAttr("aria-pressed", "false");
      });
      setPressed(true);
      onSelect(option.id);
    });
    buttons.push(button);
  }
  return group;
}

export interface ConfirmOptions {
  title: string;
  message: string;
  confirmText?: string;
  destructive?: boolean;
}

/** CSS classes for destructive buttons: "mod-destructive" (Obsidian 1.13+) and "mod-warning" (older versions). */
const DESTRUCTIVE_CLASSES = ["mod-destructive", "mod-warning"];

/**
 * Styles a button as destructive on every supported Obsidian version, without
 * the deprecated setWarning() or the 1.13-only setDestructive().
 */
function markDestructive(button: ButtonComponent): void {
  button.buttonEl.addClasses(DESTRUCTIVE_CLASSES);
}

class ConfirmModal extends Modal {
  private confirmed = false;

  constructor(
    app: App,
    private readonly options: ConfirmOptions,
    private readonly resolve: (confirmed: boolean) => void,
  ) {
    super(app);
  }

  override onOpen(): void {
    this.setTitle(this.options.title);
    this.contentEl.createEl("p", { text: this.options.message });
    new Setting(this.contentEl)
      .addButton((button) => {
        button.setButtonText(this.options.confirmText ?? "Delete").onClick(() => {
          this.confirmed = true;
          this.close();
        });
        if (this.options.destructive ?? true) markDestructive(button);
        else button.setCta();
      })
      .addButton((button) => button.setButtonText("Cancel").onClick(() => this.close()));
  }

  override onClose(): void {
    this.contentEl.empty();
    this.resolve(this.confirmed);
  }
}

/** Asks the user to confirm an action. Resolves to false when dismissed. */
export function confirmAction(app: App, options: ConfirmOptions): Promise<boolean> {
  return new Promise((resolve) => new ConfirmModal(app, options, resolve).open());
}

let fieldCounter = 0;

/** A labelled form field (`.orbitkit-field`) whose label is linked to the control for accessibility. */
export function createField(parent: HTMLElement, label: string, hint?: string): { field: HTMLElement; id: string } {
  fieldCounter += 1;
  const id = `orbitkit-field-${fieldCounter}`;
  const field = parent.createDiv({ cls: "orbitkit-field" });
  field.createEl("label", { cls: "orbitkit-field-label", text: label, attr: { for: id } });
  if (hint) field.createDiv({ cls: "orbitkit-field-hint", text: hint });
  return { field, id };
}

export interface TextFieldOptions {
  label: string;
  value?: string;
  placeholder?: string;
  hint?: string;
  type?: "text" | "number" | "date" | "search";
}

export function addTextInput(parent: HTMLElement, options: TextFieldOptions): HTMLInputElement {
  const { field, id } = createField(parent, options.label, options.hint);
  const input = field.createEl("input", {
    type: options.type ?? "text",
    attr: { id, placeholder: options.placeholder ?? "" },
  });
  input.value = options.value ?? "";
  return input;
}

export function addTextArea(
  parent: HTMLElement,
  options: Omit<TextFieldOptions, "type"> & { rows?: number },
): HTMLTextAreaElement {
  const { field, id } = createField(parent, options.label, options.hint);
  const textarea = field.createEl("textarea", {
    attr: { id, placeholder: options.placeholder ?? "", rows: String(options.rows ?? 3) },
  });
  textarea.value = options.value ?? "";
  return textarea;
}

export interface ButtonSpec {
  text: string;
  onClick: () => void;
  variant?: "cta" | "warning" | "default";
}

/** Right-aligned row of modal buttons. */
export function addButtonRow(parent: HTMLElement, buttons: readonly ButtonSpec[]): HTMLElement {
  const row = parent.createDiv({ cls: "orbitkit-buttons" });
  for (const spec of buttons) {
    const button = row.createEl("button", { text: spec.text, attr: { type: "button" } });
    if (spec.variant === "cta") button.addClass("mod-cta");
    if (spec.variant === "warning") button.addClasses(DESTRUCTIVE_CLASSES);
    button.addEventListener("click", spec.onClick);
  }
  return row;
}

/** Calls `onSubmit` when Mod+Enter (Ctrl on Windows/Linux, Cmd on macOS) is pressed in `element`. */
export function onModEnter(element: HTMLElement, onSubmit: () => void): void {
  element.addEventListener("keydown", (event: KeyboardEvent) => {
    if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      onSubmit();
    }
  });
}
