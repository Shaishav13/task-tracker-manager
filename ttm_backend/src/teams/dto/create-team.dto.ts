import { IsNotEmpty, IsString, IsOptional, IsArray } from 'class-validator';

export class CreateTeamDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsString()
  @IsOptional()
  managerId?: string;

  @IsString()
  @IsNotEmpty()
  teamLeadId!: string;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  memberUserIds?: string[];
}
