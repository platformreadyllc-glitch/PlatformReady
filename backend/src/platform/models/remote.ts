import { Role, Button } from './enums';

export interface RemoteSerialized {
  remoteId: string;
  role: Role;
  platformId: string;
  hasVibration: boolean;
  hasDisplay: boolean;
  hasClockButton: boolean;
  buttonCount: number;
  availableButtons: Button[];
  connected: boolean;
  batteryLevel: number | null;
  lastButtonPressed: Button | null;
  displayText: string;
  metadata: Record<string, unknown>;
}

export class Remote {
  remoteId: string;
  role: Role;
  platformId: string;
  hasVibration: boolean;
  hasDisplay: boolean;
  connected: boolean = false;
  batteryLevel: number | null = null;
  lastButtonPressed: Button | null = null;
  displayText: string = '';
  metadata: Record<string, unknown>;

  constructor(params: {
    remoteId: string;
    role: Role;
    platformId: string;
    hasVibration?: boolean;
    hasDisplay?: boolean;
    metadata?: Record<string, unknown>;
  }) {
    this.remoteId = params.remoteId;
    this.role = params.role;
    this.platformId = params.platformId;
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

  connect(): void {
    this.connected = true;
  }

  disconnect(): void {
    this.connected = false;
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
      hasVibration: this.hasVibration,
      hasDisplay: this.hasDisplay,
      hasClockButton: this.hasClockButton,
      buttonCount: this.buttonCount,
      availableButtons: this.availableButtons,
      connected: this.connected,
      batteryLevel: this.batteryLevel,
      lastButtonPressed: this.lastButtonPressed,
      displayText: this.displayText,
      metadata: this.metadata,
    };
  }
}
