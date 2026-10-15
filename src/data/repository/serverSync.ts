import { httpsCallable } from 'firebase/functions';
import { functions, auth } from '../../../firebase';
import { notifyError, notifySuccess } from './toast';

export interface ServerRebuildResult {
  ok: boolean;
  runId: string;
  classifiedCount: number;
  transmittersCreated: number;
  transmittersUpdated: number;
}

export interface IngestClsResult {
  ok: boolean;
  rawRetrieved?: number;
  newRawWritten?: number;
  classifiedCount?: number;
  transmittersCreated?: number;
  transmittersUpdated?: number;
  error?: string;
  message?: string;
}

export interface VerifyRepairResult {
  repairedCount: number;
  repairs: Array<{
    pttId: string;
    previousFix: string;
    correctedFix: string;
    previousCoords: [number, number];
    correctedCoords: [number, number];
  }>;
}

/**
 * Triggers server-side authoritative transmitter rebuild via Cloud Function.
 */
export async function requestServerRebuild(): Promise<ServerRebuildResult> {
  const user = auth.currentUser;
  if (!user) {
    throw new Error('Authentication required to request server rebuild.');
  }

  const callable = httpsCallable<Record<string, unknown>, ServerRebuildResult>(
    functions,
    'rebuildTransmitterSummaries'
  );
  const response = await callable({});
  return response.data;
}

/**
 * Triggers immediate CLS telemetry poll via Cloud Function.
 */
export async function requestIngestCls(apiConfig?: any): Promise<IngestClsResult> {
  const user = auth.currentUser;
  if (!user) {
    throw new Error('Authentication required to trigger CLS telemetry fetch.');
  }

  const callable = httpsCallable<{ apiConfig?: any }, IngestClsResult>(
    functions,
    'ingestClsCallable'
  );
  const response = await callable({ apiConfig });
  return response.data;
}

/**
 * Triggers server-side integrity verification and drift repair.
 */
export async function requestVerifyAndRepair(): Promise<VerifyRepairResult> {
  const user = auth.currentUser;
  if (!user) {
    throw new Error('Authentication required to run integrity verification.');
  }

  const callable = httpsCallable<Record<string, unknown>, VerifyRepairResult>(
    functions,
    'verifyAndRepairCallable'
  );
  const response = await callable({});
  return response.data;
}
