export const GROUPS = {
  upper: {
    label: "英大文字",
    chars: "ABCDEFGHIJKLMNOPQRSTUVWXYZ",
    hint: "A–Z",
  },
  lower: {
    label: "英小文字",
    chars: "abcdefghijklmnopqrstuvwxyz",
    hint: "a–z",
  },
  digits: { label: "数字", chars: "0123456789", hint: "0–9" },
  symbols: {
    label: "記号",
    chars: Array.from({ length: 94 }, (_, i) => String.fromCharCode(i + 33))
      .filter((c) => !/[A-Za-z0-9]/.test(c))
      .join(""),
    hint: "ASCII",
  },
};
export const SIMILAR_CHARACTERS = "0OQDoIl|1ijS5Z2B8q9G6";
export type Group = keyof typeof GROUPS;
export type SymbolMode = "default" | "custom";
export type Settings = {
  passwordLength: string;
  groups: Group[];
  required: boolean;
  excludeSimilar: boolean;
  excluded: string;
  symbolMode: SymbolMode;
  customSymbols: string;
};
export const DEFAULTS: Settings = {
  passwordLength: "64",
  groups: ["upper", "lower", "digits"],
  required: true,
  excludeSimilar: false,
  excluded: "",
  symbolMode: "default",
  customSymbols: "",
};
export type Errors = Partial<
  Record<"length" | "groups" | "excluded" | "symbols", string>
>;
function availableCharacters(group: Group, settings: Settings): string[] {
  const source =
    group === "symbols" && settings.symbolMode === "custom"
      ? [
          ...new Set(
            [...settings.customSymbols].filter((c) =>
              GROUPS.symbols.chars.includes(c),
            ),
          ),
        ]
      : [...GROUPS[group].chars];
  return source.filter(
    (c) =>
      !settings.excluded.includes(c) &&
      !(settings.excludeSimilar && SIMILAR_CHARACTERS.includes(c)),
  );
}
export function validate(s: Settings): Errors {
  const e: Errors = {};
  if (
    !/^\d+$/.test(s.passwordLength) ||
    +s.passwordLength < 1 ||
    +s.passwordLength > 128
  )
    e.length = "文字数は1〜128の整数で入力してください。";
  if (!s.groups.length) e.groups = "文字種を1つ以上選択してください。";
  else {
    const available = s.groups.map((g) => availableCharacters(g, s));
    const unavailable = s.groups.filter((_, i) => !available[i].length);
    const customSymbolsUnavailable =
      s.symbolMode === "custom" && unavailable.includes("symbols");
    if (customSymbolsUnavailable)
      e.symbols =
        "指定した記号セットに使用できる記号がありません。入力内容や除外設定を見直してください。";
    if (unavailable.length === s.groups.length && !customSymbolsUnavailable)
      e.excluded =
        "使用できる文字がありません。文字種や除外設定を見直してください。";
    else if (s.required) {
      const requiredUnavailable = unavailable.filter(
        (g) => !(customSymbolsUnavailable && g === "symbols"),
      );
      if (requiredUnavailable.length)
        e.excluded =
          requiredUnavailable.map((g) => GROUPS[g].label).join("・") +
          "がすべて除外されています。除外設定を見直すか、各文字種を含める設定をオフにしてください。";
    }
    if (!e.length && s.required && +s.passwordLength < s.groups.length)
      e.length = `選択した${s.groups.length}種類を含めるには、${s.groups.length}文字以上にしてください。`;
  }
  return e;
}
// Return an integer from 0 to limit - 1 without modulo bias.
function randomBelow(limit: number): number {
  const range = 2 ** 32;
  const cutoff = range - (range % limit);
  const value = new Uint32Array(1);
  do {
    crypto.getRandomValues(value);
  } while (value[0] >= cutoff);
  return value[0] % limit;
}

function allocateCounts(
  length: number,
  groupCount: number,
  required: boolean,
): number[] {
  const counts = Array<number>(groupCount).fill(required ? 1 : 0);
  const reserved = required ? groupCount : 0;
  for (let i = reserved; i < length; i++) {
    counts[randomBelow(groupCount)]++;
  }
  return counts;
}

function shuffle(characters: string[]): void {
  // Fisher–Yates: swap each position with a random remaining position.
  for (let i = characters.length - 1; i > 0; i--) {
    const j = randomBelow(i + 1);
    [characters[i], characters[j]] = [characters[j], characters[i]];
  }
}

export function generate(s: Settings): string[] {
  if (Object.keys(validate(s)).length) {
    throw new Error("Invalid settings");
  }
  const groups = s.groups
    .map((g) => availableCharacters(g, s))
    .filter((chars) => chars.length > 0);

  return Array.from({ length: 10 }, () => {
    // 1. Decide how many characters to take from each character class.
    const counts = allocateCounts(
      Number(s.passwordLength),
      groups.length,
      s.required,
    );

    // 2. Pick that many random characters from each class.
    const characters: string[] = [];
    groups.forEach((candidates, groupIndex) => {
      for (let i = 0; i < counts[groupIndex]; i++) {
        characters.push(candidates[randomBelow(candidates.length)]);
      }
    });

    // 3. Mix the classes so they do not appear in fixed blocks.
    shuffle(characters);
    return characters.join("");
  });
}

export function readSettings(value: unknown): Settings | null {
  if (!value || typeof value !== "object") return null;
  const s = value as Settings;
  if (
    typeof s.passwordLength !== "string" ||
    typeof s.excluded !== "string" ||
    typeof s.required !== "boolean" ||
    (s.excludeSimilar !== undefined && typeof s.excludeSimilar !== "boolean") ||
    (s.symbolMode !== undefined &&
      s.symbolMode !== "default" &&
      s.symbolMode !== "custom") ||
    (s.customSymbols !== undefined && typeof s.customSymbols !== "string") ||
    !Array.isArray(s.groups) ||
    !s.groups.every((g) => Object.hasOwn(GROUPS, g)) ||
    new Set(s.groups).size !== s.groups.length
  )
    return null;
  return {
    passwordLength: s.passwordLength,
    excluded: s.excluded,
    required: s.required,
    excludeSimilar: s.excludeSimilar ?? false,
    groups: [...s.groups],
    symbolMode: s.symbolMode ?? "default",
    customSymbols: s.customSymbols ?? "",
  };
}
