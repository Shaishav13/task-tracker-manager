import { IsArray, IsString } from 'class-validator';

export class SyncPermissionsDto {
  @IsArray()
  @IsString({ each: true })
  permissionIds!: string[];
}
