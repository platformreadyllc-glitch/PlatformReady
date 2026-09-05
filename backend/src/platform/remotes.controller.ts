import { Controller, Post, Body } from '@nestjs/common';
import { PlatformService } from './platform.service';
import { RegisterPhysicalRemoteDto } from './dto/register-physical-remote.dto';

// Top-level (not platform-scoped) routes for physical remotes that haven't
// been assigned to a platform yet — registration happens once by remoteId
// alone, and platform/role assignment happens later via the remote
// management page's activate/replace routes (see platform.controller.ts).
@Controller('remotes')
export class RemotesController {
  constructor(private readonly platformService: PlatformService) {}

  @Post()
  registerPhysicalRemote(@Body() dto: RegisterPhysicalRemoteDto) {
    return this.platformService.registerPhysicalRemote(dto);
  }
}
