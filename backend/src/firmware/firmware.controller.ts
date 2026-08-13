import {
  Controller,
  Get,
  Param,
  Query,
  StreamableFile,
  BadRequestException,
} from '@nestjs/common';
import { createReadStream } from 'fs';
import { FirmwareService, FirmwareType } from './firmware.service';

@Controller('firmware')
export class FirmwareController {
  constructor(private readonly firmwareService: FirmwareService) {}

  @Get('latest')
  getLatest(@Query('type') type: string) {
    if (type !== 'side' && type !== 'chief') {
      throw new BadRequestException('type must be "side" or "chief"');
    }
    return this.firmwareService.getLatest(type as FirmwareType);
  }

  @Get('download/:file')
  download(@Param('file') file: string): StreamableFile {
    const filePath = this.firmwareService.getReleaseFilePath(file);
    return new StreamableFile(createReadStream(filePath), {
      type: 'application/octet-stream',
      disposition: `attachment; filename="${file}"`,
    });
  }
}
