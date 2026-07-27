import { IsOptional, IsString } from 'class-validator';

export class ListDpAliasesDto {
  @IsOptional()
  @IsString()
  productId?: string;
}
