import { IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateEndUserRemarkDto {
  @IsOptional()
  @IsString()
  @MaxLength(512)
  remark?: string | null;
}
