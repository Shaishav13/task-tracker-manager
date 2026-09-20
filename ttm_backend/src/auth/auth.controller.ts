import { Controller, Post, Get, Body, Res, Req, HttpCode, HttpStatus, UnauthorizedException, UseGuards } from '@nestjs/common';
import { Response, Request } from 'express';
import { Throttle, SkipThrottle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { PermissionGuard } from './guards/permission.guard';
import { RequirePermission } from './decorators/require-permission.decorator';


@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  @UseGuards(JwtAuthGuard, PermissionGuard)
  @RequirePermission('USERS', 'CREATE')
  async register(@Body() registerDto: RegisterDto, @Req() req: any) {
    return this.authService.register(registerDto, req.user);
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { ttl: 60000, limit: 10 } })
  async login(
    @Body() loginDto: LoginDto,
    @Res({ passthrough: true }) response: Response
  ) {
    return this.authService.login(loginDto, response);
  }

  @SkipThrottle()
  @Get('me')
  @HttpCode(HttpStatus.OK)
  async getProfile(@Req() request: Request) {
    const authHeader = request.headers['authorization'];
    const token = authHeader?.replace('Bearer ', '');

    if (!token) {
      throw new UnauthorizedException('Access token missing');
    }

    return this.authService.getProfileFromToken(token);
  }

@Post('refresh')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { ttl: 60000, limit: 10 } })
  async refresh(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response
  ) {
    try {
      const cookieToken = request.cookies?.['refreshToken'];
      const headerToken = request.headers['authorization']?.replace('Bearer ', '');
      
      const refreshToken = cookieToken || headerToken;
      if (!refreshToken) {
        throw new UnauthorizedException('Refresh token missing');
      }
      
      return await this.authService.refreshTokens(refreshToken, response);
    } catch (error) {
      throw new UnauthorizedException('Session expired or invalid');
    }
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  async logout(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response
  ) {
    // Extract userId from authorization token if present to revoke database refresh tokens
    const authHeader = request.headers['authorization'];
    const token = authHeader?.replace('Bearer ', '');
    
    let userId = '';
    if (token) {
      try {
        const profile = await this.authService.getProfileFromToken(token);
        userId = profile.id;
      } catch {
        // Continue logout even if access token is already expired
      }
    }

    return this.authService.logout(userId, response);
  }
}