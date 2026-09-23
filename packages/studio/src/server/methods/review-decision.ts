import {
  approveEntry,
  type ReviewDecisionDeps,
  type ReviewDecisionInput,
  rejectEntry,
} from "@verbatra/sdk";
import type { ReviewDecisionParams } from "../../shared/rpc/review-decision.js";
import type { RpcHandler, RpcHandlerDeps } from "../rpc.js";

function decisionInput(params: ReviewDecisionParams, deps: RpcHandlerDeps): ReviewDecisionInput {
  return {
    config: deps.config.config,
    cwd: deps.projectRoot,
    locale: params.locale,
    key: params.key,
    expectedValue: params.expectedValue,
  };
}

function decisionDeps(deps: RpcHandlerDeps): ReviewDecisionDeps {
  return {
    ...(deps.fs !== undefined ? { fs: deps.fs } : {}),
    ...(deps.adapterRegistry !== undefined ? { adapterRegistry: deps.adapterRegistry } : {}),
  };
}

export const reviewApproveHandler: RpcHandler<"review.approve"> = async (params, deps) =>
  approveEntry(decisionInput(params, deps), decisionDeps(deps));

export const reviewRejectHandler: RpcHandler<"review.reject"> = async (params, deps) =>
  rejectEntry(decisionInput(params, deps), decisionDeps(deps));
