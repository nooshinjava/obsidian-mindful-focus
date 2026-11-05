import { addDays, createId, daysUntil, formatClockTime, formatIsoDate, isoWeekId, parseIsoDate } from "@orbitkit/shared";
import {
  addButtonRow,
  addTextArea,
  addTextInput,
  createChipGroup,
  createField,
  handleAsync,
  onModEnter,
  type ButtonSpec,
  type ChipOption,
} from "@orbitkit/shared/obsidian";
import { Modal, Notice } from "obsidian";
import { formatHours, formatItemName } from "../domain/activity";
import { MAX_SESSION_MINUTES, PRIORITY_LABELS, STATUS_LABELS } from "../domain/constants";
import {
  activeGoals,
  buildGoalFromInput,
  deadlineLabel,
  formatMilestones,
  isAtRisk,
  isCompleted,
  parseLabbookPath,
  progressPercent,
  requiredHoursPerDay,
} from "../domain/goals";
import { defaultLabbookPath } from "../domain/paths";
import { elapsedMinutes, formatDurationWords, MAX_RECORDED_MINUTES, startedLabel } from "../domain/session";
import type { ActiveSession, Goal } from "../domain/types";
import type { CompletedSession } from "../services";
import type { Actions } from "./actions";

/** Base class: titled modal with an `.orbitkit-form` body and helpers for async submits. */
abstract class FormModal extends Modal {
  protected form!: HTMLElement;

  protected constructor(protected readonly actions: Actions) {
    super(actions.app);
  }

  protected abstract readonly heading: string;
  protected abstract build(form: HTMLElement): void;

  override onOpen(): void {
    this.contentEl.addClass("mindful-focus-modal");
    this.setTitle(this.heading);
    this.form = this.contentEl.createDiv({ cls: "orbitkit-form" });
    this.build(this.form);
  }

  override onClose(): void {
    this.contentEl.empty();
  }

  /** Runs `task`; closes the modal unless it returns false. Errors become notices. */
  protected submit(context: string, task: () => Promise<boolean | void>): () => void {
    return handleAsync(context, async () => {
      if ((await task()) !== false) this.close();
    });
  }

  protected get services() {
    return this.actions.services;
  }
}

function addSelect(parent: HTMLElement, label: string, options: Record<string, string>, value: string): HTMLSelectElement {
  const { field, id } = createField(parent, label);
  const select = field.createEl("select", { cls: "dropdown", attr: { id } });
  for (const [optionValue, text] of Object.entries(options)) {
    select.createEl("option", { text, value: optionValue });
  }
  select.value = value;
  return select;
}

function addPrompt(parent: HTMLElement, text: string): void {
  if (text) parent.createDiv({ cls: "mindful-focus-prompt" }).createEl("em", { text });
}

function submitOnEnter(input: HTMLInputElement, submit: () => void): void {
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.isComposing) {
      event.preventDefault();
      submit();
    }
  });
}

function goalChips(goals: readonly Goal[], noneLabel: string): ChipOption<string>[] {
  return [{ id: "", label: noneLabel }, ...goals.map((goal) => ({ id: goal.id, label: goal.name }))];
}

// ── Goals ───────────────────────────────────────────────────────────────────

export class GoalModal extends FormModal {
  protected readonly heading: string;

  constructor(
    actions: Actions,
    private readonly goal: Goal | null,
  ) {
    super(actions);
    this.heading = goal ? "✏️ Edit goal" : "🎯 Add goal";
  }

  protected build(form: HTMLElement): void {
    const goal = this.goal;
    const name = addTextInput(form, { label: "Goal", value: goal?.name, placeholder: "e.g. Submit paper draft" });
    const row = form.createDiv({ cls: "orbitkit-field-row" });
    const deadline = addTextInput(row, {
      label: "Deadline",
      type: "date",
      value: goal?.deadline ?? formatIsoDate(addDays(new Date(), 7)),
    });
    const hours = addTextInput(row, { label: "Estimated hours", type: "number", value: String(goal?.estimatedHours ?? 10) });
    hours.min = "0.25";
    hours.step = "0.25";
    const selects = form.createDiv({ cls: "orbitkit-field-row" });
    const priority = addSelect(selects, "Priority", PRIORITY_LABELS, goal?.priority ?? "medium");
    const status = addSelect(selects, "Status", STATUS_LABELS, goal?.status ?? "not-started");
    const labbook = addTextInput(form, {
      label: "Labbook folder or note (optional)",
      value: goal?.labbookPath,
      placeholder: "e.g. Projects/My project or Projects/My project/Labbook.md",
      hint: "Vault-relative. A folder gets a Labbook.md inside it.",
    });
    const milestones = addTextArea(form, {
      label: "Milestones (one per line, start with [x] when done)",
      value: goal ? formatMilestones(goal.milestones) : "",
      placeholder: "Draft introduction\nFinish analysis\nReview and submit",
      rows: 4,
    });

    const save = this.submit("Could not save the goal", async () => {
      const result = buildGoalFromInput(
        {
          name: name.value,
          deadline: deadline.value,
          priority: priority.value,
          estimatedHours: hours.value,
          status: status.value,
          labbookPath: labbook.value,
          milestones: milestones.value,
        },
        goal,
        createId(),
      );
      if (!result.ok) {
        new Notice(result.error);
        return false;
      }
      await this.services.goals.save(result.goal);
      new Notice("Goal saved.");
      return true;
    });
    submitOnEnter(name, save);
    addButtonRow(form, [
      { text: "Cancel", onClick: () => this.close() },
      { text: "Save goal", variant: "cta", onClick: save },
    ]);
    name.focus();
  }
}

export class LabbookModal extends FormModal {
  protected readonly heading = "📓 Project labbook";

  constructor(
    actions: Actions,
    private readonly goal: Goal,
  ) {
    super(actions);
  }

  protected build(form: HTMLElement): void {
    form.createEl("p", { text: `Attach a labbook to "${this.goal.name}".` });
    const fallback = defaultLabbookPath(this.services.state.settings, this.goal.name);
    const path = addTextInput(form, {
      label: "Labbook folder or note",
      value: this.goal.labbookPath ?? fallback,
      placeholder: fallback,
      hint: "A folder gets a Labbook.md inside it. Leave empty to remove the link.",
    });

    const save = (openAfter: boolean) =>
      this.submit("Could not save the labbook", async () => {
        const result = parseLabbookPath(path.value);
        if (!result.ok) {
          new Notice(result.error);
          return false;
        }
        const updated: Goal = { ...this.goal };
        if (result.path) updated.labbookPath = result.path;
        else delete updated.labbookPath;
        await this.services.goals.save(updated);
        if (result.path && openAfter) await this.actions.openLabbook(updated);
        new Notice(result.path ? "Labbook linked." : "Labbook link removed.");
        return true;
      });

    const buttons: ButtonSpec[] = [
      { text: "Cancel", onClick: () => this.close() },
      { text: "Save", onClick: save(false) },
      { text: "Save and open", variant: "cta", onClick: save(true) },
    ];
    if (this.goal.labbookPath) {
      buttons.splice(1, 0, {
        text: "Remove link",
        variant: "warning",
        onClick: () => {
          path.value = "";
          save(false)();
        },
      });
    }
    addButtonRow(form, buttons);
    path.focus();
    path.select();
  }
}

export class LabbookNoteModal extends FormModal {
  protected readonly heading = "📝 New labbook note";

  constructor(
    actions: Actions,
    private readonly goal: Goal,
  ) {
    super(actions);
  }

  protected build(form: HTMLElement): void {
    const today = formatIsoDate(new Date());
    form.createEl("p", { cls: "mindful-focus-muted", text: `Project: ${this.goal.name}` });
    const title = addTextInput(form, { label: "Note title", value: `${today} - Notes` });
    const notes = addTextArea(form, {
      label: "Starter notes (optional)",
      placeholder: "What are you doing, trying, deciding or noticing?",
      rows: 4,
    });
    const create = this.submit("Could not create the labbook note", async () => {
      const { path, created } = await this.services.notes.createLabbookNote(this.goal, title.value || today, notes.value);
      await this.actions.openNote(path);
      new Notice(created ? "Labbook note created." : "That note already existed, so it was opened instead.");
    });
    onModEnter(notes, create);
    addButtonRow(form, [
      { text: "Cancel", onClick: () => this.close() },
      { text: "Create note", variant: "cta", onClick: create },
    ]);
    title.focus();
    title.select();
  }
}

export class LogTimeModal extends FormModal {
  protected readonly heading: string;

  constructor(
    actions: Actions,
    private readonly goal: Goal,
  ) {
    super(actions);
    this.heading = `⏱️ Log time: ${goal.name}`;
  }

  protected build(form: HTMLElement): void {
    form.createEl("p", {
      cls: "mindful-focus-muted",
      text: `So far: ${formatHours(this.goal.hoursLogged)} of ${this.goal.estimatedHours}h estimated.`,
    });
    const hours = addTextInput(form, { label: "Hours", type: "number", value: "1" });
    hours.min = "0.25";
    hours.max = "24";
    hours.step = "0.25";
    const notes = addTextArea(form, { label: "Notes (optional)", placeholder: "What did you work on?" });
    const save = this.submit("Could not log time", async () => {
      const goal = await this.services.goals.logTime(this.goal.id, hours.value, notes.value);
      new Notice(`Logged ${hours.value}h to ${goal.name}.`);
    });
    submitOnEnter(hours, save);
    onModEnter(notes, save);
    addButtonRow(form, [
      { text: "Cancel", onClick: () => this.close() },
      { text: "Log time", variant: "cta", onClick: save },
    ]);
    hours.focus();
    hours.select();
  }
}

export class WeeklyReviewModal extends FormModal {
  protected readonly heading = "📈 Goals review";

  constructor(actions: Actions) {
    super(actions);
  }

  protected build(form: HTMLElement): void {
    const today = new Date();
    const goals = this.services.goals.sorted();
    const active = activeGoals(goals, today);
    const atRisk = active.filter((goal) => isAtRisk(goal, today));
    const onTrack = active.filter((goal) => !isAtRisk(goal, today));
    const completed = goals.filter(isCompleted);

    const section = (title: string, items: readonly Goal[], cls: string, describe: (goal: Goal) => string[]) => {
      if (items.length === 0) return;
      form.createEl("h3", { cls: "mindful-focus-review-heading", text: `${title} (${items.length})` });
      const list = form.createDiv({ cls: "mindful-focus-review-list" });
      for (const goal of items) {
        const item = list.createDiv({ cls: `mindful-focus-review-item ${cls}` });
        item.createEl("strong", { text: goal.name });
        for (const line of describe(goal)) item.createDiv({ cls: "mindful-focus-muted", text: line });
      }
    };
    const summary = (goal: Goal) => `${deadlineLabel(daysUntil(goal.deadline, today))} · ${progressPercent(goal)}% done`;

    if (goals.length === 0) form.createEl("p", { cls: "mindful-focus-muted", text: "No goals yet." });
    section("🌱 Could use some attention", atRisk, "is-at-risk", (goal) => {
      const days = daysUntil(goal.deadline, today);
      return [
        summary(goal),
        days !== null && days < 0
          ? "🕰️ The deadline has passed. You can choose a new date whenever you're ready."
          : `💡 About ${requiredHoursPerDay(goal, today).toFixed(1)}h a day would get you there. If that feels like a lot, it's okay to adjust the deadline or the estimate.`,
      ];
    });
    section("🟢 On track", onTrack, "is-on-track", (goal) => [summary(goal)]);
    section("✅ Completed", completed, "is-completed", () => []);

    const logged = goals.reduce((sum, goal) => sum + goal.hoursLogged, 0);
    const estimated = goals.reduce((sum, goal) => sum + goal.estimatedHours, 0);
    form.createEl("p", { text: `⏱️ Total logged: ${formatHours(logged)} of ${estimated}h estimated.` });
    addButtonRow(form, [{ text: "Close", variant: "cta", onClick: () => this.close() }]);
  }
}

// ── Sessions ────────────────────────────────────────────────────────────────

export class StartSessionModal extends FormModal {
  protected readonly heading = "🎯 Start a focus session";
  private goalId = "";

  constructor(actions: Actions) {
    super(actions);
  }

  protected build(form: HTMLElement): void {
    addPrompt(form, this.actions.randomPrompt());
    const focus = addTextInput(form, { label: "What will you focus on?", placeholder: "e.g. Write the paper introduction" });
    const goals = activeGoals(this.services.state.settings.goals, new Date()).slice(0, 6);
    if (goals.length > 0) {
      const { field } = createField(form, "Link to a goal (optional)");
      let previousName = "";
      createChipGroup(field, goalChips(goals, "No goal"), "", (id) => {
        this.goalId = id;
        const goal = goals.find((candidate) => candidate.id === id);
        if (goal && (!focus.value.trim() || focus.value === previousName)) focus.value = goal.name;
        previousName = goal?.name ?? "";
      }, "Goal");
    }
    const minutes = addTextInput(form, {
      label: "Duration (minutes)",
      type: "number",
      value: String(this.services.state.settings.defaultSessionMinutes),
    });
    minutes.min = "1";
    minutes.max = "600";

    const start = this.submit("Could not start the session", async () => {
      const session = await this.services.sessions.start(focus.value, Number(minutes.value), this.goalId || undefined);
      new Notice(`🎯 Focus session started: ${session.focus}`);
    });
    submitOnEnter(focus, start);
    addButtonRow(form, [
      { text: "Cancel", onClick: () => this.close() },
      { text: "Start", variant: "cta", onClick: start },
    ]);
    focus.focus();
  }
}

/** Shown after a session ends. Time is already recorded; this only collects an optional reflection. */
export class ReflectionModal extends FormModal {
  protected readonly heading = "🌿 Session finished";

  constructor(
    actions: Actions,
    private readonly completed: CompletedSession,
  ) {
    super(actions);
  }

  protected build(form: HTMLElement): void {
    const { focus, minutes, goalName } = this.completed;
    form.createEl("p", { text: `You spent ${formatDurationWords(minutes)} on "${focus}".` });
    if (goalName && minutes > 0) {
      form.createDiv({ cls: "mindful-focus-notice", text: `⏱️ ${formatHours(minutes / 60)} logged to ${goalName}.` });
    }
    const accomplished = addTextArea(form, {
      label: "What did you work on? (optional)",
      placeholder: "Anything worth remembering, big or small…",
    });
    const next = addTextInput(form, { label: "A gentle next step (optional)", placeholder: "What would you like to pick up next?" });
    const save = this.submit("Could not save the reflection", async () => {
      const saved = await this.services.sessions.saveReflection(this.completed, accomplished.value, next.value);
      if (saved) new Notice("Reflection saved.");
    });
    onModEnter(accomplished, save);
    submitOnEnter(next, save);
    addButtonRow(form, [
      { text: "Not now", onClick: () => this.close() },
      { text: "Save reflection", variant: "cta", onClick: save },
    ]);
    accomplished.focus();
  }
}

/**
 * Shown when a session has stayed open well past its plan, usually because it
 * was left running. It gently asks how much time to record. Nothing is
 * recorded until the user chooses, and closing the dialog keeps the session open.
 */
export class CheckInModal extends FormModal {
  protected readonly heading = "🌿 Welcome back";

  constructor(
    actions: Actions,
    private readonly session: ActiveSession,
    private readonly onRecord: (minutes: number) => Promise<void>,
  ) {
    super(actions);
  }

  protected build(form: HTMLElement): void {
    const { session } = this;
    const now = new Date();
    const elapsed = elapsedMinutes(session, now);
    form.createEl("p", {
      text: `Your focus session on "${session.focus}" has been open since ${startedLabel(session, now, formatClockTime)}, about ${formatDurationWords(elapsed)}.`,
    });
    form.createEl("p", {
      cls: "mindful-focus-muted",
      text: "That happens to everyone. How much of that time would you like to count as focus? A rough guess is perfectly fine.",
    });

    type Choice = "planned" | "all" | "custom" | "none";
    const options: ChipOption<Choice>[] = [
      { id: "planned", label: `${formatDurationWords(session.plannedMinutes)}, as planned` },
      ...(elapsed <= MAX_SESSION_MINUTES ? [{ id: "all" as const, label: `All ${formatDurationWords(elapsed)}` }] : []),
      { id: "custom", label: "A different amount" },
      { id: "none", label: "None, just close it" },
    ];
    let choice: Choice = "planned";
    const { field } = createField(form, "Time to record");
    const custom = form.createDiv({ cls: "mindful-focus-checkin-custom" });
    const minutesInput = addTextInput(custom, {
      label: "Minutes",
      type: "number",
      value: String(Math.min(session.plannedMinutes, elapsed)),
    });
    minutesInput.min = "0";
    minutesInput.max = String(Math.min(elapsed, MAX_RECORDED_MINUTES));
    custom.toggleClass("is-hidden", true);
    createChipGroup(field, options, choice, (id) => {
      choice = id;
      custom.toggleClass("is-hidden", id !== "custom");
      if (id === "custom") minutesInput.focus();
    }, "Time to record");

    const chosenMinutes = (): number => {
      if (choice === "planned") return Math.min(session.plannedMinutes, elapsed);
      if (choice === "all") return elapsed;
      if (choice === "none") return 0;
      return Number(minutesInput.value);
    };
    const record = this.submit("Could not close the session", async () => {
      await this.onRecord(chosenMinutes());
    });
    submitOnEnter(minutesInput, record);
    addButtonRow(form, [
      { text: "Keep it running", onClick: () => this.close() },
      { text: "Record and close", variant: "cta", onClick: record },
    ]);
  }
}

// ── Logging ─────────────────────────────────────────────────────────────────

export class JournalModal extends FormModal {
  protected readonly heading = "✍️ Quick journal";

  constructor(actions: Actions) {
    super(actions);
  }

  protected build(form: HTMLElement): void {
    const prompt = this.actions.randomPrompt();
    const text = addTextArea(form, { label: prompt || "Journal", placeholder: "Write your thoughts…", rows: 6 });
    const save = this.submit("Could not save the journal entry", async () => {
      await this.services.tracking.journal(text.value);
      new Notice("Journal entry saved.");
    });
    onModEnter(text, save);
    addButtonRow(form, [
      { text: "Cancel", onClick: () => this.close() },
      { text: "Save", variant: "cta", onClick: save },
    ]);
    text.focus();
  }
}

export class ProgressModal extends FormModal {
  protected readonly heading = "📊 Log progress";
  private goalId = "";

  constructor(actions: Actions) {
    super(actions);
  }

  protected build(form: HTMLElement): void {
    const project = addTextInput(form, { label: "Project", placeholder: "Which project?" });
    const goals = activeGoals(this.services.state.settings.goals, new Date());
    if (goals.length > 0) {
      const { field } = createField(form, "Or pick a goal", "Time logged against a goal also counts towards its progress.");
      createChipGroup(field, goalChips(goals, "No goal"), "", (id) => {
        this.goalId = id;
        const goal = goals.find((candidate) => candidate.id === id);
        if (goal) project.value = goal.name;
      }, "Goal");
      // Typing a different project name unlinks the goal.
      project.addEventListener("input", () => {
        const goal = goals.find((candidate) => candidate.id === this.goalId);
        if (goal && project.value.trim() !== goal.name) this.goalId = "";
      });
    }
    const hours = addTextInput(form, { label: "Hours worked", type: "number", value: "1" });
    hours.min = "0";
    hours.max = "24";
    hours.step = "0.25";
    const what = addTextArea(form, { label: "What did you do?", placeholder: "Describe what you accomplished…", rows: 4 });
    const save = this.submit("Could not log progress", async () => {
      await this.services.tracking.logProgress(project.value, hours.value, what.value, this.goalId || undefined);
      new Notice(`Progress logged for ${project.value.trim()}.`);
    });
    onModEnter(what, save);
    addButtonRow(form, [
      { text: "Cancel", onClick: () => this.close() },
      { text: "Log progress", variant: "cta", onClick: save },
    ]);
    project.focus();
  }
}

export class WeeklyLogModal extends FormModal {
  protected readonly heading = "⏱️ Log weekly time";

  constructor(actions: Actions) {
    super(actions);
  }

  protected build(form: HTMLElement): void {
    const settings = this.services.state.settings;
    const logged = this.services.tracking.weeklyCategoryHours();
    form.createEl("p", { cls: "mindful-focus-muted", text: `Week ${isoWeekId(new Date())}` });

    const { field, id } = createField(form, "Category");
    const select = field.createEl("select", { cls: "dropdown", attr: { id } });
    for (const category of Object.values(settings.lifeCategories)) {
      const group = select.createEl("optgroup", { attr: { label: category.name } });
      for (const item of category.items) {
        const label = `${formatItemName(item, settings.categoryNames)} (${(logged[item] ?? 0).toFixed(1)} / ${settings.weeklyTargets[item] ?? 0}h)`;
        group.createEl("option", { text: label, value: item });
      }
    }

    const hours = addTextInput(form, { label: "Hours", type: "number", value: "1" });
    hours.min = "0.25";
    hours.max = "24";
    hours.step = "0.25";
    const quick = form.createDiv({ cls: "orbitkit-chips" });
    for (const value of [0.25, 0.5, 1, 1.5, 2]) {
      quick
        .createEl("button", { cls: "orbitkit-chip", text: `${value}h`, attr: { type: "button" } })
        .addEventListener("click", () => {
          hours.value = String(value);
        });
    }
    const notes = addTextInput(form, { label: "Notes (optional)", placeholder: "What did you do?" });

    const save = this.submit("Could not log time", async () => {
      const name = await this.services.tracking.logCategoryTime(select.value, hours.value, notes.value);
      new Notice(`Logged ${hours.value}h to ${name}.`);
    });
    submitOnEnter(hours, save);
    submitOnEnter(notes, save);
    addButtonRow(form, [
      { text: "Cancel", onClick: () => this.close() },
      { text: "Log time", variant: "cta", onClick: save },
    ]);
    hours.focus();
  }
}

// ── Dates ───────────────────────────────────────────────────────────────────

export interface DatePickerOptions {
  title: string;
  description: string;
  submitText: string;
  defaultOffsetDays: number;
  minToday: boolean;
  quickPicks: ReadonlyArray<{ label: string; days: number }>;
  onSubmit: (date: Date) => Promise<void>;
}

/** Date picker with quick-pick buttons, used for future daily notes and weekly plans. */
export class DatePickerModal extends FormModal {
  protected readonly heading: string;

  constructor(
    actions: Actions,
    private readonly options: DatePickerOptions,
  ) {
    super(actions);
    this.heading = options.title;
  }

  protected build(form: HTMLElement): void {
    const today = new Date();
    form.createEl("p", { cls: "mindful-focus-muted", text: this.options.description });
    const input = addTextInput(form, {
      label: "Date",
      type: "date",
      value: formatIsoDate(addDays(today, this.options.defaultOffsetDays)),
    });
    if (this.options.minToday) input.min = formatIsoDate(today);
    const quick = form.createDiv({ cls: "orbitkit-chips" });
    for (const pick of this.options.quickPicks) {
      quick
        .createEl("button", { cls: "orbitkit-chip", text: pick.label, attr: { type: "button" } })
        .addEventListener("click", () => {
          input.value = formatIsoDate(addDays(new Date(), pick.days));
        });
    }
    const submit = this.submit("Could not open the note", async () => {
      const date = parseIsoDate(input.value);
      if (!date) {
        new Notice("Pick a valid date.");
        return false;
      }
      await this.options.onSubmit(date);
      return true;
    });
    addButtonRow(form, [
      { text: "Cancel", onClick: () => this.close() },
      { text: this.options.submitText, variant: "cta", onClick: submit },
    ]);
  }
}
