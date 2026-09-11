import { Role, Button, HardwareType, Transport } from './enums';

export interface RemoteSerialized {
  remoteId: string;
  role: Role;
  platformId: string | null;
  // Undefined for remotes registered by pre-hardwareType firmware that
  // never reported it.
  hardwareType?: HardwareType;
  hasVibration: boolean;
  hasDisplay: boolean;
  hasClockButton: boolean;
  buttonCount: number;
  availableButtons: Button[];
  connected: boolean;
  transport: Transport;
  batteryLevel: number | null;
  lastButtonPressed: Button | null;
  displayText: string;
  metadata: Record<string, unknown>;
}

export class Remote {
  remoteId: string;
  role: Role;
  platformId: string | null;
  hardwareType?: HardwareType;
  hasVibration: boolean;
  hasDisplay: boolean;
  connected: boolean = false;
  transport: Transport = null;
  batteryLevel: number | null = null;
  lastButtonPressed: Button | null = null;
  displayText: string = '';
  metadata: Record<string, unknown>;

  constructor(params: {
    remoteId: string;
    role: Role;
    platformId: string | null;
    hardwareType?: HardwareType;
    hasVibration?: boolean;
    hasDisplay?: boolean;
    metadata?: Record<string, unknown>;
  }) {
    this.remoteId = params.remoteId;
    this.role = params.role;
    this.platformId = params.platformId;
    this.hardwareType = params.hardwareType;
    this.hasVibration = params.hasVibration ?? false;
    this.hasDisplay = params.hasDisplay ?? false;
    this.metadata = params.metadata ?? {};
  }

  get hasClockButton(): boolean {
    return this.role === 'chief';
  }

  get buttonCount(): number {
    return this.availableButtons.length;
  }

  get availableButtons(): Button[] {
    const buttons: Button[] = ['red', 'yellow', 'blue', 'white'];
    if (this.hasClockButton) {
      buttons.push('clock');
    }
    return buttons;
  }

  pressButton(buttonName: Button): void {
    if (!this.availableButtons.includes(buttonName)) {
      throw new Error(`Button ${buttonName} not available on this remote`);
    }
    this.lastButtonPressed = buttonName;
  }

  connect(transport: Transport = null): void {
    this.connected = true;
    this.transport = transport;
  }

  disconnect(): void {
    this.connected = false;
    this.transport = null;
  }

  setBatteryLevel(percent: number): void {
    if (percent < 0 || percent > 100) {
      throw new Error('Battery level must be between 0 and 100');
    }
    this.batteryLevel = percent;
  }

  updateDisplay(text: string): void {
    if (!this.hasDisplay) {
      throw new Error('This remote does not have a display');
    }
    this.displayText = text;
  }

  serialize(): RemoteSerialized {
    return {
      remoteId: this.remoteId,
      role: this.role,
      platformId: this.platformId,
      hardwareType: this.hardwareType,
      hasVibration: this.hasVibration,
      hasDisplay: this.hasDisplay,
      hasClockButton: this.hasClockButton,
      buttonCount: this.buttonCount,
      availableButtons: this.availableButtons,
      connected: this.connected,
      transport: this.transport,
      batteryLevel: this.batteryLevel,
      lastButtonPressed: this.lastButtonPressed,
      displayText: this.displayText,
      metadata: this.metadata,
    };
  }
}
