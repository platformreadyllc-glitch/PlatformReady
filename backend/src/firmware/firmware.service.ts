import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { readFileSync, existsSync } from 'fs';
import { join, resolve } from 'path';

export type FirmwareType = 'side' | 'chief';

interface ManifestEntry {
  version: string;
  file: string;
}

type Manifest = Partial<Record<FirmwareType, ManifestEntry>>;

const FILENAME_PATTERN = /^[A-Za-z0-9_.-]+\.bin$/;

@Injectable()
export class FirmwareService {
  private readonly releasesDir = join(process.cwd(), 'firmware-releases');
  private readonly manifestPath = join(this.releasesDir, 'manifest.json');

  // Re-read on every call: the manifest is a few dozen bytes and devices
  // poll infrequently, so caching would only add staleness risk (having to
  // invalidate on manual manifest edits) for no measurable perf benefit.
  private readManifest(): Manifest {
    const raw = readFileSync(this.manifestPath, 'utf8');
    return JSON.parse(raw) as Manifest;
  }

  getLatest(type: FirmwareType): { version: string; url: string } {
    const entry = this.readManifest()[type];
    if (!entry) {
      throw new NotFoundException(`No firmware published for type "${type}"`);
    }
    return { version: entry.version, url: `/firmware/download/${entry.file}` };
  }

  getReleaseFilePath(file: string): string {
    if (!FILENAME_PATTERN.test(file)) {
      throw new BadRequestException('Invalid firmware filename');
    }

    const manifest = this.readManifest();
    const knownFiles = Object.values(manifest).map((entry) => entry?.file);
    if (!knownFiles.includes(file)) {
      throw new NotFoundException(`Firmware file "${file}" not found`);
    }

    const filePath = resolve(join(this.releasesDir, file));
    if (!filePath.startsWith(resolve(this.releasesDir))) {
      // Defense-in-depth: the regex above already blocks '/' and '..', so
      // this should be unreachable, but never serve outside releasesDir.
      throw new BadRequestException('Invalid firmware filename');
    }

    if (!existsSync(filePath)) {
      throw new NotFoundException(`Firmware file "${file}" not found`);
    }

    return filePath;
  }
}
