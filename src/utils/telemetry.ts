export interface TelemetryEvent {
  timestamp: string;
  requestId: string;
  toolName: string;
  mode: 'compact' | 'full';
  status: 'success' | 'error';
  latencyMs: number;
  retries: number;
  quotaUnitsEstimated: number;
  quotaUnitsReserved: number;
  cacheHit: boolean;
  idempotencyReplay: boolean;
  errorCode?: string;
  errorMessage?: string;
}

export interface TelemetrySink {
  emit(event: TelemetryEvent): void;
}

export class ConsoleTelemetrySink implements TelemetrySink {
  emit(event: TelemetryEvent): void {
    console.error(`[telemetry] ${JSON.stringify(event)}`);
  }
}

export class TelemetryRecorder {
  constructor(
    private readonly sink: TelemetrySink,
    private readonly enabled: boolean,
  ) {}

  track(event: TelemetryEvent): void {
    if (!this.enabled) {
      return;
    }
    this.sink.emit(event);
  }

  isEnabled(): boolean {
    return this.enabled;
  }
}
