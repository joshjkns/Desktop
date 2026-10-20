// "Add application" dialog for the Games page — the way a user gets
// something games.json doesn't know about onto the page (lib/custom-games.ts).
// Two ways in: browse for the executable (native picker, so the path is
// exact), or type a process name / paste a path. Either way all that ends up
// mattering is the process base name, so that's shown live, along with
// whether it's running right now — the quickest way to confirm the match
// will actually fire before saving.

import { useEffect, useState } from "preact/hooks";
import { open } from "@tauri-apps/plugin-dialog";
import { X, FolderOpen, Terminal } from "lucide-preact";
import type { Game } from "../hooks/use-game-watcher";
import { addCustomGame, fetchAppIcon, parseExecutableInput } from "../lib/custom-games";

interface Props {
  /** Everything already on the page, to flag a duplicate before it's added. */
  games: Game[];
  runningProcesses: Set<string>;
  onClose: () => void;
  /** Called with the new entry; "Add & set up profile" passes `editProfile`. */
  onAdded: (game: Game, editProfile: boolean) => void;
}

export function AddCustomGameModal({ games, runningProcesses, onClose, onAdded }: Props) {
  const [target, setTarget] = useState("");
  const [name, setName] = useState("");
  const [browseError, setBrowseError] = useState("");
  const [icon, setIcon] = useState<string | undefined>();
  const parsed = parseExecutableInput(target);
  const looksLikePath = /[\\/]/.test(target);
  const cleanPath = looksLikePath ? target.trim().replace(/^"(.*)"$/, "$1") : "";

  // Debounced so typing a path doesn't fire an icon lookup per keystroke;
  // a picked path lands in one go and resolves just as quickly.
  useEffect(() => {
    setIcon(undefined);
    if (!cleanPath) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      void fetchAppIcon(cleanPath).then((result) => {
        if (!cancelled) setIcon(result);
      });
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [cleanPath]);

  const duplicate = parsed
    ? games.find((game) => game.executables.some((exe) => exe.toLowerCase() === parsed.executable))
    : undefined;
  const runningNow = parsed ? runningProcesses.has(parsed.executable) : false;

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  async function browse() {
    setBrowseError("");
    try {
      const picked = await open({ multiple: false, directory: false, title: "Choose an application" });
      if (typeof picked !== "string") return;
      setTarget(picked);
      const result = parseExecutableInput(picked);
      if (result && !name) setName(result.name);
    } catch (error) {
      setBrowseError(error instanceof Error ? error.message : String(error));
    }
  }

  function submit(editProfile: boolean) {
    if (!parsed || duplicate) return;
    const custom = addCustomGame({
      name: name || parsed.name,
      executable: parsed.executable,
      path: cleanPath || undefined,
      icon,
    });
    onAdded(
      { id: custom.id, name: custom.name, executables: [custom.executable], custom: true, path: custom.path, icon: custom.icon },
      editProfile,
    );
  }

  const displayName = name || parsed?.name || "";

  return (
    <div class="modal-overlay" onClick={onClose}>
      <form
        class="modal-panel add-app-panel"
        onClick={(event) => event.stopPropagation()}
        onSubmit={(event) => {
          event.preventDefault();
          submit(false);
        }}
      >
        <div class="modal-panel-header">
          <h2>Add application</h2>
          <button type="button" class="icon-button" onClick={onClose} title="Close">
            <X size={16} />
          </button>
        </div>

        <div class="add-app-preview">
          <div class="add-app-preview-mark" aria-hidden="true">
            {icon ? <img src={icon} alt="" /> : displayName ? displayName.slice(0, 1).toUpperCase() : "?"}
          </div>
          <div class="add-app-preview-text">
            <span class="add-app-preview-name">{displayName || "No application chosen"}</span>
            <span class="add-app-preview-path" title={looksLikePath ? target : undefined}>
              {looksLikePath ? target : parsed ? "Matched by process name" : "Browse or type a path below"}
            </span>
          </div>
        </div>

        <button type="button" class="add-app-browse" onClick={() => void browse()}>
          <FolderOpen size={16} />
          <span>{looksLikePath ? "Choose a different file…" : "Browse for application…"}</span>
        </button>
        {browseError && <p class="add-app-error">{browseError}</p>}

        <div class="add-app-divider"><span>or enter it manually</span></div>

        <label class="add-app-field">
          <span class="setting-eyebrow">Path or process name</span>
          <div class="add-app-input-wrap">
            <Terminal size={14} aria-hidden="true" />
            <input
              class="add-app-input"
              type="text"
              placeholder="C:\Games\osu!\osu!.exe  or  osu!.exe"
              value={target}
              spellcheck={false}
              autoFocus
              onInput={(event) => setTarget(event.currentTarget.value)}
            />
          </div>
        </label>

        <label class="add-app-field">
          <span class="setting-eyebrow">Display name</span>
          <input
            class="add-app-input add-app-input-plain"
            type="text"
            placeholder={parsed?.name ?? "Shown on the card"}
            value={name}
            onInput={(event) => setName(event.currentTarget.value)}
          />
        </label>

        {parsed && (
          <div class={`add-app-detect ${duplicate ? "add-app-detect-warn" : ""}`}>
            {duplicate ? (
              <>
                <strong>{duplicate.name}</strong> already watches <code>{parsed.executable}</code>.
              </>
            ) : (
              <>
                <span class={`add-app-detect-dot ${runningNow ? "running" : ""}`} aria-hidden="true" />
                <span>
                  Detected when <code>{parsed.executable}</code> is running
                  {runningNow ? " — it's running now." : "."}
                </span>
              </>
            )}
          </div>
        )}

        <div class="modal-panel-footer">
          <button type="button" class="apply-bar-revert" onClick={onClose}>Cancel</button>
          <button type="submit" class="apply-bar-revert" disabled={!parsed || !!duplicate}>Add</button>
          <button
            type="button"
            class="apply-bar-apply"
            disabled={!parsed || !!duplicate}
            onClick={() => submit(true)}
          >
            Add & set up profile
          </button>
        </div>
      </form>
    </div>
  );
}
