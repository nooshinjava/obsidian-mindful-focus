import { daysUntil, formatClockTime, VIEW_TYPES } from "@orbitkit/shared";
import { handleAsync } from "@orbitkit/shared/obsidian";
import { ItemView, setIcon, type IconName, type WorkspaceLeaf } from "obsidian";
import { formatHours, formatItemName, weeklyCategoryProgress } from "../domain/activity";
import { DEFAULT_CATEGORY_COLOR, PRIORITY_LABELS } from "../domain/constants";
import { deadlineLabel, isCompleted, progressPercent, urgencyOf } from "../domain/goals";
import { isHexColor } from "../domain/migrate";
import { elapsedSeconds, formatElapsed } from "../domain/session";
import type { Goal } from "../domain/types";
import type { Actions } from "./actions";

const MAX_MILESTONES_SHOWN = 5;

/**
 * The Mindful Focus sidebar. Re-renders when plugin data changes; the session
 * timer updates its own text every second without re-rendering, so scroll
 * position and expanded categories are kept.
 */
export class MindfulFocusView extends ItemView {
  private readonly expandedCategories = new Set<string>();
  private elapsedEl: HTMLElement | null = null;

  constructor(
    leaf: WorkspaceLeaf,
    private readonly actions: Actions,
  ) {
    super(leaf);
  }

  override getViewType(): string {
    return VIEW_TYPES.mindfulFocus;
  }

  override getDisplayText(): string {
    return "Mindful Focus";
  }

  override getIcon(): IconName {
    return "target";
  }

  override onOpen(): Promise<void> {
    this.register(this.actions.services.state.subscribe(() => this.render()));
    this.registerInterval(window.setInterval(() => this.updateElapsed(), 1000));
    this.render();
    return Promise.resolve();
  }

  override onClose(): Promise<void> {
    this.contentEl.empty();
    return Promise.resolve();
  }

  render(): void {
    const container = this.contentEl;
    const scrollTop = container.scrollTop;
    container.empty();
    container.addClass("orbitkit-view", "mindful-focus-view");

    this.renderSession(container);
    this.renderGoals(container);
    this.renderWeek(container);
    this.renderPrompt(container);
    this.renderQuickActions(container);

    container.scrollTop = scrollTop;
  }

  private section(parent: HTMLElement, title: string, cls: string): { section: HTMLElement; header: HTMLElement } {
    const section = parent.createDiv({ cls: `orbitkit-section ${cls}` });
    const header = section.createDiv({ cls: "mindful-focus-section-header" });
    header.createEl("h3", { cls: "orbitkit-section-title", text: title });
    return { section, header };
  }

  private button(parent: HTMLElement, text: string, onClick: () => void, cls = ""): HTMLButtonElement {
    const button = parent.createEl("button", { cls: `mindful-focus-button ${cls}`.trim(), text, attr: { type: "button" } });
    button.addEventListener("click", onClick);
    return button;
  }

  private iconButton(parent: HTMLElement, icon: IconName, label: string, onClick: () => void): void {
    const button = parent.createEl("button", { cls: "clickable-icon", attr: { type: "button", "aria-label": label } });
    setIcon(button, icon);
    button.addEventListener("click", onClick);
  }

  // ── Sections ──────────────────────────────────────────────────────────────

  private renderSession(parent: HTMLElement): void {
    const { section } = this.section(parent, "🎯 Current focus", "mindful-focus-session");
    const session = this.actions.services.sessions.active;
    this.elapsedEl = null;
    if (!session) {
      section.createEl("p", { cls: "mindful-focus-muted", text: "No active session." });
      this.button(section, "▶️ Start focus session", () => this.actions.openStartSession(), "mod-cta");
      return;
    }
    const box = section.createDiv({ cls: "mindful-focus-session-box" });
    box.createEl("strong", { text: session.focus });
    const goal = this.actions.services.goals.find(session.goalId);
    if (goal) box.createDiv({ cls: "mindful-focus-muted", text: `Goal: ${goal.name}` });
    box.createDiv({
      cls: "mindful-focus-muted",
      text: `Started ${formatClockTime(new Date(session.startedAt))} · planned ${session.plannedMinutes} min`,
    });
    this.elapsedEl = box.createDiv({ cls: "mindful-focus-elapsed" });
    this.updateElapsed();
    this.button(section, "⏹️ End session", handleAsync("Could not end the session", () => this.actions.endSession()), "mod-cta");
  }

  private updateElapsed(): void {
    const session = this.actions.services.sessions.active;
    if (!session || !this.elapsedEl) return;
    this.elapsedEl.setText(`${formatElapsed(elapsedSeconds(session, new Date()))} elapsed`);
  }

  private renderGoals(parent: HTMLElement): void {
    const { section, header } = this.section(parent, "📅 Goals and deadlines", "mindful-focus-goals");
    this.button(header, "+ Add", () => this.actions.openGoalModal(), "is-small");
    const goals = this.actions.services.goals.sorted();
    if (goals.length === 0) {
      section.createEl("p", { cls: "mindful-focus-muted", text: "No goals yet. Add one to start tracking." });
      return;
    }
    const list = section.createDiv({ cls: "mindful-focus-goal-list" });
    const today = new Date();
    for (const goal of goals) this.renderGoal(list, goal, today);
  }

  private renderGoal(list: HTMLElement, goal: Goal, today: Date): void {
    const urgency = urgencyOf(goal, today);
    const card = list.createDiv({ cls: `orbitkit-card is-static mindful-focus-goal urgency-${urgency}` });

    const header = card.createDiv({ cls: "orbitkit-card-header" });
    header.createEl("strong", { cls: `orbitkit-card-title${isCompleted(goal) ? " is-done" : ""}`, text: goal.name });
    header.createSpan({ cls: `mindful-focus-priority priority-${goal.priority}`, text: PRIORITY_LABELS[goal.priority] });

    const deadline = card.createDiv({ cls: "mindful-focus-deadline" });
    deadline.createSpan({ text: `📅 ${goal.deadline}` });
    if (!isCompleted(goal)) {
      deadline.createSpan({
        cls: `mindful-focus-days urgency-${urgency}`,
        text: deadlineLabel(daysUntil(goal.deadline, today)),
      });
    }

    if (goal.labbookPath) {
      const link = card.createEl("button", {
        cls: "mindful-focus-labbook-link",
        text: `📓 ${goal.labbookPath}`,
        attr: { type: "button", "aria-label": "Open project labbook" },
      });
      link.addEventListener("click", handleAsync("Could not open the labbook", () => this.actions.openLabbook(goal)));
    }

    const percent = progressPercent(goal);
    const progress = card.createDiv({ cls: "mindful-focus-progress" });
    const bar = progress.createDiv({
      cls: "mindful-focus-progress-bar",
      attr: { role: "progressbar", "aria-valuemin": "0", "aria-valuemax": "100", "aria-valuenow": String(percent) },
    });
    bar.createDiv({ cls: "mindful-focus-progress-fill" }).setCssProps({ "--mindful-focus-progress": `${percent}%` });
    progress.createSpan({
      cls: "mindful-focus-muted",
      text: `${formatHours(goal.hoursLogged)} / ${goal.estimatedHours}h (${percent}%)`,
    });

    if (goal.milestones.length > 0) {
      const milestones = card.createDiv({ cls: "mindful-focus-milestones" });
      goal.milestones.slice(0, MAX_MILESTONES_SHOWN).forEach((milestone, index) => {
        const label = milestones.createEl("label", { cls: "mindful-focus-milestone" });
        const checkbox = label.createEl("input", { type: "checkbox" });
        checkbox.checked = milestone.done;
        checkbox.addEventListener(
          "change",
          handleAsync("Could not update the milestone", () => this.actions.services.goals.toggleMilestone(goal.id, index)),
        );
        label.createSpan({ cls: milestone.done ? "is-done" : "", text: milestone.text });
      });
      const hidden = goal.milestones.length - MAX_MILESTONES_SHOWN;
      if (hidden > 0) milestones.createDiv({ cls: "mindful-focus-muted", text: `+${hidden} more (edit the goal to see all)` });
    }

    const actions = card.createDiv({ cls: "orbitkit-icon-buttons mindful-focus-goal-actions" });
    this.iconButton(actions, "pencil", "Edit goal", () => this.actions.openGoalModal(goal));
    this.iconButton(actions, "timer", "Log time", () => this.actions.openLogTime(goal));
    if (goal.labbookPath) {
      this.iconButton(actions, "book-open", "Open labbook", handleAsync("Could not open the labbook", () => this.actions.openLabbook(goal)));
      this.iconButton(actions, "file-plus", "New labbook note", () => this.actions.openLabbookNote(goal));
    } else {
      this.iconButton(actions, "book-plus", "Add a labbook", () => this.actions.openLabbookSetup(goal));
    }
    if (!isCompleted(goal)) {
      this.iconButton(actions, "check-circle", "Mark completed", handleAsync("Could not complete the goal", () => this.actions.completeGoal(goal)));
    }
    this.iconButton(actions, "trash-2", "Delete goal", handleAsync("Could not delete the goal", () => this.actions.deleteGoal(goal)));
  }

  private renderWeek(parent: HTMLElement): void {
    const { section, header } = this.section(parent, "📊 This week", "mindful-focus-week");
    const buttons = header.createDiv({ cls: "mindful-focus-header-buttons" });
    this.button(buttons, "📋 Plan", handleAsync("Could not open the weekly plan", () => this.actions.openWeeklyPlan(new Date())), "is-small");
    this.button(buttons, "+ Log", () => this.actions.openWeeklyLog(), "is-small");

    const settings = this.actions.services.state.settings;
    const logged = this.actions.services.tracking.weeklyCategoryHours();
    const progress = weeklyCategoryProgress(settings.lifeCategories, settings.weeklyTargets, logged);

    for (const category of progress) {
      const color = isHexColor(category.category.color) ? category.category.color : DEFAULT_CATEGORY_COLOR;
      const block = section.createDiv({ cls: "mindful-focus-category" });
      block.setCssProps({ "--mindful-focus-category-color": color });
      const expanded = this.expandedCategories.has(category.key);
      const toggle = block.createEl("button", {
        cls: "mindful-focus-category-header",
        attr: { type: "button", "aria-expanded": String(expanded) },
      });
      toggle.createSpan({ cls: "mindful-focus-category-name", text: category.category.name });
      toggle.createSpan({
        cls: "mindful-focus-muted",
        text: `${formatHours(category.logged)} / ${category.category.weeklyTarget}h`,
      });
      const bar = block.createDiv({ cls: "mindful-focus-progress-bar" });
      bar
        .createDiv({ cls: "mindful-focus-progress-fill is-category" })
        .setCssProps({ "--mindful-focus-progress": `${category.percent}%` });

      const items = block.createDiv({ cls: `mindful-focus-category-items${expanded ? "" : " is-collapsed"}` });
      for (const item of category.items) {
        const row = items.createDiv({ cls: "mindful-focus-category-item" });
        row.createSpan({ text: formatItemName(item.key, settings.categoryNames) });
        row.createSpan({ cls: "mindful-focus-hours", text: `${formatHours(item.logged)} / ${item.target}h` });
      }
      toggle.addEventListener("click", () => {
        const nowExpanded = !this.expandedCategories.has(category.key);
        if (nowExpanded) this.expandedCategories.add(category.key);
        else this.expandedCategories.delete(category.key);
        items.toggleClass("is-collapsed", !nowExpanded);
        toggle.setAttr("aria-expanded", String(nowExpanded));
      });
    }

    const totalLogged = progress.reduce((sum, category) => sum + category.logged, 0);
    const totalTarget = progress.reduce((sum, category) => sum + category.category.weeklyTarget, 0);
    section.createDiv({ cls: "mindful-focus-week-total", text: `Total: ${formatHours(totalLogged)} / ${totalTarget}h` });
  }

  private renderPrompt(parent: HTMLElement): void {
    const { section } = this.section(parent, "💭 Mindful prompt", "mindful-focus-prompt-section");
    const prompt = section.createDiv({ cls: "mindful-focus-prompt" }).createEl("em", { text: this.actions.randomPrompt() });
    this.button(section, "🔄 New prompt", () => prompt.setText(this.actions.randomPrompt()));
  }

  private renderQuickActions(parent: HTMLElement): void {
    const { section } = this.section(parent, "⚡ Quick actions", "mindful-focus-quick");
    const row = section.createDiv({ cls: "orbitkit-actions" });
    this.button(row, "📝 Today's note", handleAsync("Could not open today's note", () => this.actions.openDailyNote(new Date())));
    this.button(row, "📅 Plan a day", () => this.actions.openFutureDayPicker());
    this.button(row, "📋 Plan a week", () => this.actions.openWeeklyPlanPicker());
    this.button(row, "✍️ Journal", () => this.actions.openJournal());
    this.button(row, "📊 Log progress", () => this.actions.openProgress());
    this.button(row, "📈 Review goals", () => this.actions.openWeeklyReview());
    this.button(row, "🗒️ Weekly report", handleAsync("Could not generate the report", () => this.actions.generateWeeklyReport()));
  }
}

export function isMindfulFocusView(view: unknown): view is MindfulFocusView {
  return view instanceof MindfulFocusView;
}
