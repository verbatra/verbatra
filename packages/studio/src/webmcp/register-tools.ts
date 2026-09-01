import { z } from "zod";
import type { RpcClient } from "../client/rpc-client.js";
import { STATUS_CHECK_METHOD } from "../shared/rpc/check.js";
import type { RpcMethodName, RpcParamsFor, rpcParamsSchemas } from "../shared/rpc/contract.js";
import { RPC_METHOD_NAMES } from "../shared/rpc/contract.js";
import { STATUS_DIFF_METHOD } from "../shared/rpc/diff.js";
import { EDIT_ENTRY_METHOD } from "../shared/rpc/edit-entry.js";
import { GLOSSARY_GET_METHOD, GLOSSARY_WRITE_METHOD } from "../shared/rpc/glossary.js";
import { HISTORY_LIST_METHOD } from "../shared/rpc/history.js";
import { KEY_INTEGRITY_METHOD } from "../shared/rpc/key-integrity.js";
import { KEY_VALUE_METHOD } from "../shared/rpc/key-value.js";
import { LOCALE_VALUES_METHOD } from "../shared/rpc/locale-values.js";
import { LOCK_STATE_METHOD } from "../shared/rpc/lock.js";
import { RETRANSLATE_ENTRY_METHOD } from "../shared/rpc/retranslate-entry.js";
import { REVIEW_QUEUE_METHOD } from "../shared/rpc/review-queue.js";
import { PROJECT_SNAPSHOT_METHOD } from "../shared/rpc/snapshot.js";
import { TRANSLATE_PENDING_METHOD } from "../shared/rpc/translate-pending.js";
import { USAGE_SUMMARY_METHOD } from "../shared/rpc/usage-summary.js";
import type { AgentToolsRegistration, ToolRegistrationFailure } from "./registration-report.js";
import { NOTHING_ATTEMPTED, toRegistrationFailure } from "./registration-report.js";

export interface WebMcpToolAnnotations {
  readonly readOnlyHint?: boolean;
  readonly untrustedContentHint?: boolean;
}

export interface WebMcpTool {
  readonly name: string;
  readonly description: string;
  readonly inputSchema: object;
  readonly execute: (input: unknown) => Promise<string>;
  readonly annotations?: WebMcpToolAnnotations;
}

export interface RegisterToolOptions {
  readonly signal?: AbortSignal;
}

export interface ModelContext {
  registerTool(tool: WebMcpTool, options?: RegisterToolOptions): PromiseLike<void> | void;
}

export interface RegisterAgentToolsDeps {
  readonly modelContext: ModelContext | undefined;
  readonly rpcClient: RpcClient;
  readonly schemas: typeof rpcParamsSchemas;
  readonly signal?: AbortSignal;
}

interface ToolDescriptor {
  readonly description: string;
  readonly readOnlyHint: boolean;
  readonly untrustedContentHint: boolean;
  readonly spendGated: boolean;
}

const TOOL_DESCRIPTORS: Record<RpcMethodName, ToolDescriptor> = {
  [PROJECT_SNAPSHOT_METHOD]: {
    description:
      "Reads the loaded project configuration: source locale, target locales, file format and pattern, provider id, glossary provenance, and the server capability flags. " +
      "Call it first to learn which locales and provider every other tool acts on, and to see whether the spend capability is granted. " +
      "Do not use it to read translated text, and do not expect it to change between calls: the projection is resolved once when the server starts. " +
      "Takes no parameters, calls no provider, and writes nothing.",
    readOnlyHint: true,
    untrustedContentHint: false,
    spendGated: false,
  },
  [STATUS_CHECK_METHOD]: {
    description:
      "Reports, per target locale, how many keys are missing, stale, or up to date against the source, as counts only. " +
      "Use it for a fast answer to how far a project has drifted before deciding whether any translation work is needed. " +
      "Do not use it when you need the affected key names, which only verbatra_status_diff returns. " +
      "The optional `locales` parameter narrows the report to the named target locales, an omitted `locales` covers every configured target locale, and an explicitly empty array is rejected as invalid params. " +
      "Read-only: it calls no provider and writes nothing.",
    readOnlyHint: true,
    untrustedContentHint: false,
    spendGated: false,
  },
  [STATUS_DIFF_METHOD]: {
    description:
      "Lists, per target locale, the key names that are added, changed, or orphaned relative to the source. " +
      "Use it after verbatra_status_check when you need the actual keys behind the counts, for instance to pick one key to inspect or fix. " +
      "Do not use it as a content view: it returns key names, never translated values, and the lists are uncapped, so a large project returns a large result. " +
      "The optional `locales` parameter narrows the report to the named target locales, an omitted `locales` covers every configured target locale, and an explicitly empty array is rejected as invalid params. " +
      "Read-only: it calls no provider and writes nothing.",
    readOnlyHint: true,
    untrustedContentHint: true,
    spendGated: false,
  },
  [GLOSSARY_GET_METHOD]: {
    description:
      "Reads the project glossary: the configured term mappings plus whether they came from the config file inline, from a separate JSON file, or are absent entirely. " +
      "Use it to learn the terminology a translation is expected to follow before you write or request one, and to see whether the glossary can be changed at all, since only a file-backed one can. " +
      "Do not treat every value as verbatim: each glossary value passes through secret redaction first, so a value shaped like a provider API key is returned as a placeholder rather than its real text, and the result's list of redacted terms names exactly those terms. " +
      "A file-backed glossary is read fresh from disk on every call, so it reflects edits made since the server started. " +
      "Takes no parameters. Read-only: it calls no provider and writes nothing.",
    readOnlyHint: true,
    untrustedContentHint: true,
    spendGated: false,
  },
  [GLOSSARY_WRITE_METHOD]: {
    description:
      "Adds, replaces, or removes exactly one term in the project glossary, rewriting the JSON file the config points at and returning the glossary as it now stands. " +
      "Use it to keep brand terms and fixed vocabulary current, since it spends no provider budget at all and changes no translated text. " +
      "Do not expect it to work on every project: only a file-backed glossary can be written, so a glossary written inline in the config, or no glossary at all, is refused as not file backed and nothing is converted on your behalf. " +
      "Do not send back a value verbatra_glossary_get reported as redacted, because that value is a redaction placeholder rather than the real text and writing it would destroy the original. " +
      "The required `term` parameter is the source term, capped at 200 characters, and the required `translation` parameter is its replacement text, capped at 2000 characters, or null to remove the term entirely. " +
      "There is no parameter naming a file: the target is derived from the loaded config alone. The write replaces the previous value with no undo on this surface, and the rest of the file keeps its order and indentation. " +
      "This tool is always registered: editing the glossary needs no capability flag and is never gated behind the spend flag.",
    readOnlyHint: false,
    untrustedContentHint: true,
    spendGated: false,
  },
  [LOCK_STATE_METHOD]: {
    description:
      "Reads the lock file: whether one exists at all and, when it does, its version and the per locale count of keys that are missing, stale, or up to date against the recorded baseline. " +
      "Use it to tell a project that has never been translated, which has no lock file, from one whose recorded baseline has drifted. " +
      "Do not confuse it with verbatra_status_check, which compares the locale files themselves rather than the recorded lock baseline. " +
      "Takes no parameters. Read-only: it reads the lock and locale files fresh on every call, calls no provider, and writes nothing.",
    readOnlyHint: true,
    untrustedContentHint: false,
    spendGated: false,
  },
  [HISTORY_LIST_METHOD]: {
    description:
      "Lists recent git commits that touched the source locale file or any configured target locale file, each with its hash, author date, subject, and touched paths. " +
      "Use it to see who last changed a locale file and when. " +
      "Do not rely on it outside a git repository: when git is missing or the project root is not a repository the result reports itself as unavailable instead of failing, and file renames are never followed, so history before a rename is not shown. " +
      "The optional `limit` parameter asks for at most that many commits, and the server applies its own cap regardless of what you ask for. " +
      "Read-only: it calls no provider and writes nothing.",
    readOnlyHint: true,
    untrustedContentHint: true,
    spendGated: false,
  },
  [KEY_INTEGRITY_METHOD]: {
    description:
      "Reports, for one key, whether each target locale's current value keeps the source placeholders and stays valid ICU MessageFormat. " +
      "Use it to decide whether a translation is safe to keep, typically right after writing or requesting one. " +
      "Do not read absence as a pass or a failure: a locale appears only while the key counts as changed there, so a locale where the key is missing, orphaned, or already in sync carries no entry at all. " +
      "The required `key` parameter is the source key to inspect, the optional `locales` parameter narrows the check to the named target locales, and an omitted `locales` covers every configured target locale. " +
      "The result carries only the boolean outcomes and the specific placeholder tokens involved, never a full source or target string. " +
      "Read-only: it calls no provider and writes nothing.",
    readOnlyHint: true,
    untrustedContentHint: true,
    spendGated: false,
  },
  [REVIEW_QUEUE_METHOD]: {
    description:
      "Lists the entries the last recorded translation run flagged as needing human review, per locale, with the reason code behind each flag. " +
      "Use it to find the translations most worth a second look before spending anything on them. " +
      "Do not treat an unavailable result as an empty queue: it means no run has ever recorded a status snapshot, or that snapshot is missing, corrupt, or at an unrecognized version. " +
      "Only a real translation run refreshes the snapshot, so an entry corrected through verbatra_translation_editEntry stays listed here until the next run. " +
      "Takes no parameters. Read-only: it calls no provider and writes nothing.",
    readOnlyHint: true,
    untrustedContentHint: true,
    spendGated: false,
  },
  [USAGE_SUMMARY_METHOD]: {
    description:
      "Reads the run wide token usage and budget figures recorded by the last translation run, together with the time that run was recorded. " +
      "Use it to judge what previous work cost before deciding to spend more. " +
      "Do not expect live figures: nothing but a real translation run updates it, and an unavailable result means no run has ever recorded a status snapshot. " +
      "Usage and budget are each present only when the recorded run carried them, and are never defaulted to a fabricated zero. " +
      "Takes no parameters. Read-only: it calls no provider and writes nothing.",
    readOnlyHint: true,
    untrustedContentHint: false,
    spendGated: false,
  },
  [KEY_VALUE_METHOD]: {
    description:
      "Reads the current source value and, when it exists, the current target value for exactly one key in exactly one target locale. " +
      "Use it to see the text before changing it, and to confirm afterwards what was written. " +
      "Do not use it for bulk reads: it answers for a single pair per call, and verbatra_locale_values is the bulk equivalent. " +
      "The required `locale` parameter must be a configured target locale and the required `key` parameter must exist in the source, and an unknown locale or key is answered as an error rather than an empty result. " +
      "An absent target value means the key does not exist in that locale yet, while an empty string is a real stored value. " +
      "Read-only: it reads fresh from disk on every call, calls no provider, and writes nothing.",
    readOnlyHint: true,
    untrustedContentHint: true,
    spendGated: false,
  },
  [LOCALE_VALUES_METHOD]: {
    description:
      "Reads the current source value and, when it exists, the current target value for every key, across every configured target locale, in one call. " +
      "Use it when you need translation content in bulk, for instance to search or scan values rather than key names, since verbatra_key_value only answers for one key at a time. " +
      "Do not use it to change anything: it is read-only and its result can be large on a project with many keys and locales. " +
      "An absent target value means the key has not been translated in that locale yet; an absent source value means the key is orphaned, present in the target locale but no longer in the source. " +
      "Takes no parameters. Read-only: it reads fresh from disk on every call, calls no provider, and writes nothing.",
    readOnlyHint: true,
    untrustedContentHint: true,
    spendGated: false,
  },
  [EDIT_ENTRY_METHOD]: {
    description:
      "Writes one caller supplied translation for exactly one key in exactly one target locale. " +
      "Use it whenever you already know the correct text, since it spends no provider budget at all. " +
      "Do not use it to obtain a translation: it never calls a provider, so what is written is exactly the text you send. " +
      "The required `locale` parameter must be a configured target locale, the required `key` parameter must exist in the source, and the required `value` parameter is the replacement text, capped at 20000 characters. " +
      "The value is checked for placeholder and ICU integrity before anything is written, so a rejected value is returned with its reason and nothing is written, while an accepted value is written to the target locale file and its lock entry immediately, replacing the previous value with no undo on this surface. " +
      "This tool is always registered: local editing needs no capability flag and is never gated behind the spend flag.",
    readOnlyHint: false,
    untrustedContentHint: true,
    spendGated: false,
  },
  [RETRANSLATE_ENTRY_METHOD]: {
    description:
      "Spends provider budget on every call: asks the configured provider for a fresh translation of exactly one key in exactly one target locale, then writes it to the target locale file and its lock entry if it passes the placeholder and ICU integrity check. " +
      "Use it only when a translation is genuinely wrong or missing and you have no correct text of your own, because verbatra_translation_editEntry writes a known value for free. " +
      "Do not call it to preview or to retry blindly: the provider is billed before the integrity check runs, so a rejected result still costs money while writing nothing, and the call is not idempotent, since every call is billed again and can return different text. " +
      "The write cannot be undone through this surface: the previous value is replaced, and only verbatra_translation_editEntry can restore it, and only if you read it with verbatra_key_value first. " +
      "The required `locale` parameter must be a configured target locale and the required `key` parameter must exist in the source. " +
      "It is registered only when the server was started with the spend capability granted.",
    readOnlyHint: false,
    untrustedContentHint: true,
    spendGated: true,
  },
  [TRANSLATE_PENDING_METHOD]: {
    description:
      "Spends provider budget on every call, potentially a lot of it: translates every pending key across every configured target locale in one whole project run, the same work the verbatra translate command does, and writes the results to the locale files and the lock file. " +
      "Use it only to bring a whole project current when many keys are pending and the cost is acceptable. " +
      "Do not use it for a single key, where verbatra_translation_retranslateEntry is far cheaper, and do not retry it as though it were free: the call is not idempotent, since a second run bills again for whatever is still pending and can return different text. " +
      "The writes cannot be undone through this surface, and the run is not all or nothing, so a run that fails partway can leave some locales already written and others untouched. " +
      "It takes no parameters, because source drift can affect every target locale at once, and only one run may be in flight at a time, so a second concurrent call is refused rather than queued. " +
      "It is registered only when the server was started with the spend capability granted.",
    readOnlyHint: false,
    untrustedContentHint: true,
    spendGated: true,
  },
};

function toToolName(method: RpcMethodName): string {
  return `verbatra_${method.replaceAll(".", "_")}`;
}

function buildAnnotations(descriptor: ToolDescriptor): WebMcpToolAnnotations {
  return {
    readOnlyHint: descriptor.readOnlyHint,
    ...(descriptor.untrustedContentHint ? { untrustedContentHint: true } : {}),
  };
}

function buildTool<M extends RpcMethodName>(
  method: M,
  descriptor: ToolDescriptor,
  deps: RegisterAgentToolsDeps,
): WebMcpTool {
  return {
    name: toToolName(method),
    description: descriptor.description,
    inputSchema: z.toJSONSchema(deps.schemas[method]),
    annotations: buildAnnotations(descriptor),
    execute: async (input: unknown): Promise<string> => {
      const result = await deps.rpcClient.call(method, input as RpcParamsFor<M>);
      return JSON.stringify(result);
    },
  };
}

function isAborted(signal: AbortSignal | undefined): boolean {
  return signal?.aborted === true;
}

export async function registerAgentTools(
  deps: RegisterAgentToolsDeps,
): Promise<AgentToolsRegistration> {
  const { modelContext, signal } = deps;
  if (modelContext === undefined || isAborted(signal)) {
    return NOTHING_ATTEMPTED;
  }
  const snapshot = await deps.rpcClient.call(PROJECT_SNAPSHOT_METHOD, {});
  if (!snapshot.ok || snapshot.result.exposeAgentTools !== true || isAborted(signal)) {
    return NOTHING_ATTEMPTED;
  }
  const options = signal === undefined ? undefined : { signal };
  const spendGranted = snapshot.result.capabilities.spend;
  const registered: string[] = [];
  const failures: ToolRegistrationFailure[] = [];
  for (const method of RPC_METHOD_NAMES) {
    const descriptor = TOOL_DESCRIPTORS[method];
    if (isAborted(signal)) {
      break;
    }
    if (descriptor.spendGated && !spendGranted) {
      continue;
    }
    const tool = buildTool(method, descriptor, deps);
    try {
      await modelContext.registerTool(tool, options);
      registered.push(tool.name);
    } catch (error) {
      failures.push(toRegistrationFailure(tool.name, error));
    }
  }
  return { attempted: registered.length + failures.length, registered, failures };
}
