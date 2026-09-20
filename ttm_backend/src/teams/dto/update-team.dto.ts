import { IsString, IsOptional, IsArray } from 'class-validator';

export class UpdateTeamDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  managerId?: string;

  @IsString()
  @IsOptional()
  teamLeadId?: string;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  memberUserIds?: string[];
}
