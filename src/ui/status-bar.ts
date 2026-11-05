import { truncate } from "@orbitkit/shared";
import type { Plugin } from "obsidian";
import { elapsedSeconds, formatElapsed } from "../domain/session";
import type { SessionService } from "../services/sessions";

/** The status-bar timer. Can be shown and hidden at runtime from the settings. */
export class StatusBar {
  private el: HTMLElement | null = null;

  constructor(
    private readonly plugin: Plugin,
    private readonly sessions: SessionService,
    private readonly onClick: () => void,
  ) {}

  setVisible(visible: boolean): void {
    if (visible && !this.el) {
      this.el = this.plugin.addStatusBarItem();
      this.el.addClass("mod-clickable", "mindful-focus-status");
      this.el.setAttr("aria-label", "Open Mindful Focus");
      this.el.addEventListener("click", this.onClick);
    } else if (!visible && this.el) {
      this.el.remove();
      this.el = null;
    }
    this.tick();
  }

  tick(): void {
    if (!this.el) return;
    const session = this.sessions.active;
    this.el.setText(
      session
        ? `🎯 ${formatElapsed(elapsedSeconds(session, new Date()))} ${truncate(session.focus, 15)}`
        : "🎯 Ready to focus",
    );
    this.el.toggleClass("is-active", session !== null);
  }
}
