import { IsInt, IsOptional, IsString, Min } from 'class-validator';

export class UpsertDpAliasDto {
  @IsString()
  productId!: string;

  @IsString()
  code!: string;

  @IsString()
  alias!: string;

  @IsOptional()
  @IsString()
  groupName?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;
}
