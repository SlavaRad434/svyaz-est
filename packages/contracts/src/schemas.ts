/**
 * Runtime-схемы zod для входных DTO.
 * Правила docs/interfaces.md §7: неизвестные поля запрещены
 * (включая переданный authorId), числа конечны, скорости положительны,
 * RTT неотрицателен.
 */
import { z } from 'zod';

const uuid = z.string().uuid();
const instant = z.string().datetime({ offset: false, precision: 3 });

export const networkTypeSchema = z.enum(['2g', '3g', '4g', '5g', 'unknown']);
export const transportSchema = z.enum(['cellular', 'wifi', 'other', 'unknown']);
export const environmentSchema = z.enum(['indoor', 'outdoor', 'unknown']);
export const vpnStatusSchema = z.enum(['detected', 'not-detected', 'unknown']);
export const profileCodeSchema = z.enum(['basic', 'video-call']);
export const cellStatusSchema = z.enum(['green', 'yellow', 'red', 'insufficient_data']);

const provenanceCode = z.string().min(1).max(64);
const metadataProvenanceSchema = z
  .object({
    operatorId: provenanceCode,
    networkType: provenanceCode,
    transport: provenanceCode,
    vpn: provenanceCode,
    environment: provenanceCode,
  })
  .strict();

/** Положительная конечная скорость, Мбит/с: пропуск не равен нулю. */
const speedMbps = z.number().finite().positive();
/** Неотрицательное конечное время, мс. */
const nonNegativeMs = z.number().finite().nonnegative();

const metadataShape = {
  operatorId: z.string().min(1).nullable(),
  networkType: networkTypeSchema,
  transport: transportSchema,
  vpn: vpnStatusSchema,
  environment: environmentSchema,
  metadataProvenance: metadataProvenanceSchema,
};

export const measurementInputSchema = z
  .object({
    ...metadataShape,
    attemptId: uuid,
    testSessionId: uuid,
    gridVersion: z.string().min(1),
    cellId: z.string().min(1),
    occurredAt: instant,
    downloadMbps: speedMbps,
    uploadMbps: speedMbps,
    rttMs: nonNegativeMs,
    source: z.literal('builtin-speed-test'),
    inputMethod: z.literal('automatic'),
    methodVersion: z.string().min(1),
  })
  .strict();

export const failureEventInputSchema = z
  .object({
    ...metadataShape,
    attemptId: uuid,
    testSessionId: uuid.nullable(),
    gridVersion: z.string().min(1).nullable(),
    cellId: z.string().min(1).nullable(),
    occurredAt: instant,
    stage: z.enum(['session', 'probe', 'download', 'upload']),
    errorCode: z.enum(['NETWORK_ERROR', 'TIMEOUT', 'SERVER_ERROR']),
    source: z.literal('builtin-speed-test'),
    methodVersion: z.string().min(1),
  })
  .strict();

export const createTestSessionInputSchema = z
  .object({
    attemptId: uuid,
    trafficLimitBytes: z.number().int().positive(),
  })
  .strict();

export const cellFiltersSchema = z
  .object({
    operatorId: z.string().min(1),
    networkType: networkTypeSchema,
    environment: environmentSchema,
    periodFrom: instant,
    periodTo: instant,
    profileCode: profileCodeSchema,
  })
  .strict();

export type MeasurementInputParsed = z.infer<typeof measurementInputSchema>;
export type FailureEventParsed = z.infer<typeof failureEventInputSchema>;
