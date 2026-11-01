"use client";
import { useEffect, useRef, useState } from "react";
import {
  DEFAULTS,
  GROUPS,
  SIMILAR_CHARACTERS,
  generate,
  readSettings,
  validate,
  type Settings,
  type Group,
  type Errors,
} from "@/lib/password";
const STORAGE_KEY = "password-generator.settings.v1";
export default function Home() {
  const [settings, setSettings] = useState<Settings>(DEFAULTS);
  const [ready, setReady] = useState(false),
    [save, setSave] = useState(false),
    [storageError, setStorageError] = useState("");
  const [passwords, setPasswords] = useState<string[]>([]),
    [failure, setFailure] = useState(""),
    [messages, setMessages] = useState<Record<number, string>>({});
  const [blurred, setBlurred] = useState<Record<string, boolean>>({}),
    [settled, setSettled] = useState(false),
    [composing, setComposing] = useState(false);
  const delay = useRef(200),
    version = useRef(0);
  const [sliderDraft, setSliderDraft] = useState<string | null>(null);
  const sliderActive = useRef(false);
  const generationTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  const errors = validate(settings),
    invalid = Object.keys(errors).length > 0;
  const editingEmpty = !settings.length && !blurred.length;
  function regenerate(s: Settings) {
    clearTimeout(generationTimer.current);
    version.current++;
    setMessages({});
    setFailure("");
    try {
      setPasswords(generate(s));
    } catch {
      setPasswords([]);
      setFailure("パスワードを生成できませんでした。もう一度お試しください。");
    }
  }
  useEffect(() => {
    let restored = DEFAULTS,
      enabled = false,
      warning = "";
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = readSettings(JSON.parse(raw));
        if (parsed) {
          restored = parsed;
          enabled = true;
        } else
          warning = "保存した条件を読み込めませんでした。初期値を使用します。";
      }
    } catch {
      warning = "このブラウザーでは保存した条件を読み込めませんでした。";
    }
    const timer = setTimeout(() => {
      setSettings(restored);
      setSave(enabled);
      setStorageError(warning);
      setReady(true);
    }, 0);
    return () => clearTimeout(timer);
  }, []);
  useEffect(() => {
    if (!ready || composing) return;
    const timer = setTimeout(() => {
      setSettled(true);
      if (Object.keys(validate(settings)).length) {
        setPasswords([]);
        setMessages({});
      } else {
        regenerate(settings);
      }
    }, delay.current);
    generationTimer.current = timer;
    return () => clearTimeout(timer);
  }, [settings, ready, composing]);
  useEffect(() => {
    if (!ready || !save || composing) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(readSettings(settings)));
    } catch {
      const timer = setTimeout(
        () =>
          setStorageError(
            "生成条件を保存できませんでした。ブラウザーの保存設定を確認してください。",
          ),
        0,
      );
      return () => clearTimeout(timer);
    }
  }, [settings, save, ready, composing]);
  function update(patch: Partial<Settings>, immediate = false) {
    clearTimeout(generationTimer.current);
    delay.current = immediate ? 0 : 200;
    version.current++;
    // Exclusion edits retain the existing inputs until validation/generation finishes.
    if (patch.excluded === undefined) setPasswords([]);
    setMessages({});
    setFailure("");
    setSettled(false);
    setSettings((s) => ({ ...s, ...patch }));
  }
  function beginSlider() {
    sliderActive.current = true;
    clearTimeout(generationTimer.current);
  }
  function commitSlider(length: string) {
    sliderActive.current = false;
    setSliderDraft(null);
    delay.current = 0;
    const next = { ...settings, length };
    // Keep valid results mounted until their replacements are ready.
    // Invalid committed conditions still clear results as before.
    if (Object.keys(validate(next)).length) {
      version.current++;
      setPasswords([]);
      setMessages({});
      setFailure("");
    }
    setSettings(next);
  }
  function finishSlider(length: string) {
    if (sliderActive.current) commitSlider(length);
  }
  function toggleSave(checked: boolean) {
    setSave(checked);
    setStorageError("");
    if (!checked)
      try {
        localStorage.removeItem(STORAGE_KEY);
      } catch {
        setStorageError(
          "保存済みの条件を削除できませんでした。ブラウザーのサイトデータから削除してください。",
        );
      }
  }
  async function copy(password: string, index: number) {
    const current = version.current;
    try {
      await navigator.clipboard.writeText(password);
      if (current !== version.current) return;
      setMessages((m) => ({ ...m, [index]: "コピーしました" }));
      setTimeout(() => {
        if (current === version.current)
          setMessages((m) => ({ ...m, [index]: "" }));
      }, 2000);
    } catch {
      if (current === version.current)
        setMessages((m) => ({
          ...m,
          [index]:
            "コピーできませんでした。文字列を選択してコピーしてください。",
        }));
    }
  }
  function visibleError(key: keyof Errors) {
    return (
      !!errors[key] &&
      (settled || blurred[key]) &&
      (key !== "length" || settings[key] !== "" || blurred[key])
    );
  }
  function error(key: keyof Errors) {
    return visibleError(key) ? (
      <p className="error" id={`${key}-error`} role="status">
        {errors[key]}
      </p>
    ) : null;
  }
  return (
    <main>
      <header>
        <h1>パスワード生成ツール</h1>
        <p>
          パスワードを作ることに飽きた開発者が作ったツールです。このアプリはパスワードをあなたのブラウザー内で生成し、外部に一切送信しませんので、アプリの開発者は生成したパスワードを知ることができません。ご利用は無保証ですが、安心してご利用ください。
        </p>
      </header>
      <section className="panel" aria-label="生成条件">
        <div className="numbers">
          <div className="field">
            <label htmlFor="length">パスワードの文字数</label>
            <div className="number-wrap">
              <input
                id="length"
                type="number"
                min="1"
                max="128"
                step="1"
                value={sliderDraft ?? settings.length}
                disabled={!ready}
                onFocus={() => setBlurred((b) => ({ ...b, length: false }))}
                onBlur={() => setBlurred((b) => ({ ...b, length: true }))}
                onChange={(e) => update({ length: e.target.value })}
                aria-invalid={visibleError("length")}
                aria-describedby={
                  visibleError("length") ? "length-error" : undefined
                }
              />
              <span>文字</span>
            </div>
            <input
              type="range"
              min="1"
              max="128"
              step="1"
              value={Math.min(
                128,
                Math.max(1, +(sliderDraft ?? settings.length) || 1),
              )}
              disabled={!ready}
              aria-label="パスワードの文字数（スライダー）"
              onPointerDown={(e) => {
                beginSlider();
                e.currentTarget.setPointerCapture(e.pointerId);
              }}
              onPointerUp={(e) => finishSlider(e.currentTarget.value)}
              onPointerCancel={(e) => finishSlider(e.currentTarget.value)}
              onLostPointerCapture={(e) => finishSlider(e.currentTarget.value)}
              onKeyDown={(e) => {
                if (
                  [
                    "ArrowLeft",
                    "ArrowRight",
                    "ArrowUp",
                    "ArrowDown",
                    "Home",
                    "End",
                    "PageUp",
                    "PageDown",
                  ].includes(e.key)
                )
                  beginSlider();
              }}
              onKeyUp={(e) => {
                if (
                  [
                    "ArrowLeft",
                    "ArrowRight",
                    "ArrowUp",
                    "ArrowDown",
                    "Home",
                    "End",
                    "PageUp",
                    "PageDown",
                  ].includes(e.key)
                )
                  finishSlider(e.currentTarget.value);
              }}
              onBlur={(e) => finishSlider(e.currentTarget.value)}
              onChange={(e) => {
                if (sliderActive.current) setSliderDraft(e.target.value);
                else commitSlider(e.target.value);
              }}
            />
            <div className="range-labels">
              <span>1</span>
              <span>128</span>
            </div>
            {error("length")}
          </div>
        </div>
        <fieldset>
          <legend>パスワードに使用する文字種</legend>
          <div className="choices">
            {(Object.keys(GROUPS) as Group[]).map((g) => (
              <label
                className={`choice ${settings.groups.includes(g) ? "selected" : ""}`}
                key={g}
              >
                <input
                  type="checkbox"
                  checked={settings.groups.includes(g)}
                  disabled={!ready}
                  onChange={(e) =>
                    update(
                      {
                        groups: e.target.checked
                          ? [...settings.groups, g]
                          : settings.groups.filter((v) => v !== g),
                      },
                      true,
                    )
                  }
                  aria-describedby={
                    visibleError("groups") ? "groups-error" : undefined
                  }
                />
                <span>
                  {GROUPS[g].label}
                  <small>{GROUPS[g].hint}</small>
                </span>
              </label>
            ))}
          </div>
          {error("groups")}
        </fieldset>
        <details>
          <summary>記号選択時に使う文字を確認</summary>
          <code>{GROUPS.symbols.chars}</code>
          <p>空白は含みません。使用禁止文字に入力した記号は除外します。</p>
        </details>
        <label className="check-line">
          <input
            type="checkbox"
            checked={settings.required}
            disabled={!ready}
            onChange={(e) => update({ required: e.target.checked }, true)}
          />
          選択した文字種をそれぞれ1文字以上含める
        </label>
        <div className="similar-excluded">
          <label className="check-line">
            <input
              type="checkbox"
              checked={settings.excludeSimilar}
              disabled={!ready}
              onChange={(e) =>
                update({ excludeSimilar: e.target.checked }, true)
              }
            />
            視認しにくい文字を除外する
          </label>
          <p className="hint">
            オンにすると、次の文字を生成候補から除外します。
          </p>
          <p className="similar-characters">
            <code>{SIMILAR_CHARACTERS}</code>
          </p>
        </div>
        <div className="field excluded">
          <label htmlFor="excluded">
            使用禁止文字 <span className="optional">任意</span>
          </label>
          <input
            id="excluded"
            type="text"
            value={settings.excluded}
            disabled={!ready}
            autoComplete="off"
            spellCheck={false}
            onCompositionStart={() => {
              clearTimeout(generationTimer.current);
              version.current++;
              setComposing(true);
              setSettled(false);
              setMessages({});
            }}
            onCompositionEnd={() => setComposing(false)}
            onChange={(e) => update({ excluded: e.target.value })}
            aria-invalid={visibleError("excluded")}
            aria-describedby={`excluded-help${visibleError("excluded") ? " excluded-error" : ""}`}
          />
          <p className="hint" id="excluded-help">
            入力した文字を除外します。区切り文字は不要で、大文字・小文字は区別します。
          </p>
          {error("excluded")}
        </div>
        <div className="save-area">
          <label className="check-line">
            <input
              type="checkbox"
              checked={save}
              disabled={!ready}
              onChange={(e) => toggleSave(e.target.checked)}
            />
            このブラウザーに生成条件を保存する
          </label>
          <p className="hint">
            保存するのは条件だけです。パスワードは保存しません。
          </p>
          {storageError && (
            <p className="error" role="status">
              {storageError}
            </p>
          )}
        </div>
      </section>
      <section className="results" aria-label="生成されたパスワード">
        {invalid && settled && !editingEmpty && (
          <p className="empty-note">生成条件を確認してください。</p>
        )}
        {failure && (
          <p className="error" role="status">
            {failure}
          </p>
        )}
        {passwords.map((password, index) => (
          <div className="result" key={index}>
            <div className="result-row">
              <span className="row-number" aria-hidden="true">
                {String(index + 1).padStart(2, "0")}
              </span>
              <input
                type="text"
                readOnly
                value={password}
                aria-label={`パスワード ${index + 1}`}
                autoComplete="off"
                spellCheck={false}
                onFocus={(e) => e.target.select()}
              />
              <button
                className="copy"
                onClick={() => copy(password, index)}
                aria-label={`パスワード ${index + 1} をコピー`}
              >
                {messages[index] === "コピーしました" ? "コピー済み" : "コピー"}
              </button>
            </div>
            <div
              className={
                messages[index]?.startsWith("コピーでき")
                  ? "error"
                  : "copy-status"
              }
              role="status"
            >
              {messages[index]}
            </div>
          </div>
        ))}
        <button
          className="regenerate"
          disabled={!ready || invalid || composing}
          onClick={() => regenerate(settings)}
        >
          <span aria-hidden="true">↻</span> パスワードを再生成
        </button>
      </section>
      <footer>
        <a
          href="https://github.com/kumarstack55/vercel-password-generator"
          className="underline underline-offset-4"
        >
          GitHubでソースコードを見る
        </a>
      </footer>
    </main>
  );
}
