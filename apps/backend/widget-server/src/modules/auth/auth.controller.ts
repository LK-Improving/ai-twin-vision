import { Body, Controller, Get, HttpCode, Post, Put, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { TokenPair, UserProfile } from '@dt/shared-types';
import { AuthService } from './auth.service';
import { ChangePasswordDto, LoginDto, RefreshTokenDto } from './dto/auth.dto';
import { Public } from '../../common/decorators/public.decorator';
import { CurrentUser, type RequestUser } from '../../common/decorators/current-user.decorator';
import { ResponseMessage } from '../../common/decorators/response-message.decorator';
import { OperationLog } from '../../common/decorators/operation-log.decorator';
import type { Request } from 'express';

/** 从请求中提取设备指纹、UA 与真实 IP */
function extractContext(request: Request): {
  deviceId?: string;
  userAgent?: string;
  ipAddress?: string;
} {
  const deviceHeader = request.headers['x-device-id'];
  const forwarded = request.headers['x-forwarded-for'];
  const ip = Array.isArray(forwarded)
    ? forwarded[0]
    : (forwarded ?? request.socket?.remoteAddress ?? '');
  return {
    deviceId: Array.isArray(deviceHeader) ? deviceHeader[0] : deviceHeader,
    userAgent: request.headers['user-agent'],
    ipAddress: ip.split(',')[0].trim() || undefined,
  };
}

@ApiTags('用户认证')
@Controller({ path: 'auth', version: '1' })
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('login')
  @HttpCode(200)
  @ApiOperation({ summary: '用户登录，获取访问令牌' })
  @ResponseMessage('登录成功')
  login(@Body() dto: LoginDto, @Req() request: Request): Promise<TokenPair> {
    return this.authService.login(dto, extractContext(request));
  }

  @Public()
  @Post('refresh')
  @HttpCode(200)
  @ApiOperation({ summary: '刷新访问令牌（令牌轮换）' })
  refresh(@Body() dto: RefreshTokenDto, @Req() request: Request): Promise<TokenPair> {
    return this.authService.refresh(dto, extractContext(request));
  }

  @Post('logout')
  @HttpCode(200)
  @ApiBearerAuth()
  @ApiOperation({ summary: '用户登出，使令牌失效' })
  @ResponseMessage('登出成功')
  @OperationLog({ module: '用户认证', action: '登出' })
  async logout(@CurrentUser() user: RequestUser, @Req() request: Request): Promise<null> {
    await this.authService.logout(user.userId, extractContext(request).deviceId);
    return null;
  }

  @Get('profile')
  @ApiBearerAuth()
  @ApiOperation({ summary: '获取当前登录用户信息（含角色与权限）' })
  profile(@CurrentUser('userId') userId: string): Promise<UserProfile> {
    return this.authService.getProfile(userId);
  }

  @Put('password')
  @ApiBearerAuth()
  @ApiOperation({ summary: '修改当前用户密码（修改后需重新登录）' })
  @ResponseMessage('密码修改成功')
  @OperationLog({ module: '用户认证', action: '修改密码', recordParams: false })
  async changePassword(
    @CurrentUser('userId') userId: string,
    @Body() dto: ChangePasswordDto,
  ): Promise<null> {
    await this.authService.changePassword(userId, dto.oldPassword, dto.newPassword);
    return null;
  }
}
