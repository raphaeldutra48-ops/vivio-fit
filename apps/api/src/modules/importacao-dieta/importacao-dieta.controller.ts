import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Papel, type LeituraDeDieta, type UsuarioAutenticado } from '@vivio/contracts';
import { z } from 'zod';
import { Papeis } from '../../common/decorators/papeis.decorator';
import { UsuarioAtual } from '../../common/decorators/usuario-atual.decorator';
import { PapeisGuard } from '../../common/guards/papeis.guard';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { ImportacaoDietaService } from './importacao-dieta.service';

const importarSchema = z.object({
  chave: z.string().min(10),
  mimeType: z.enum(['application/pdf', 'image/jpeg', 'image/png', 'image/webp']),
  /**
   * Ausente = importando o modelo do próprio profissional.
   *
   * A distinção não é cosmética: com aluno há dado de saúde de terceiro saindo
   * do servidor, e o serviço exige os consentimentos dele.
   */
  alunoId: z.string().cuid().nullish(),
});
type ImportarInput = z.infer<typeof importarSchema>;

const PROFISSIONAIS = [Papel.PERSONAL, Papel.NUTRICIONISTA, Papel.MEDICO, Papel.ADMIN] as const;

@ApiTags('importacao-dieta')
@ApiBearerAuth()
@UseGuards(PapeisGuard)
@Controller('importacao-dieta')
export class ImportacaoDietaController {
  constructor(private readonly importacao: ImportacaoDietaService) {}

  /**
   * Lê o documento e devolve um RASCUNHO. Não salva plano nenhum.
   *
   * Salvar fica com o endpoint de dieta que já existe, depois que a pessoa
   * conferiu na tela — separar os dois é o que garante que nada entra como
   * prescrição sem passar por um olho humano.
   */
  @Post()
  @Papeis(...PROFISSIONAIS)
  @ApiOperation({ summary: 'Transcreve um plano alimentar em PDF ou foto, para conferência' })
  importar(
    @UsuarioAtual() usuario: UsuarioAutenticado,
    @Body(new ZodValidationPipe(importarSchema)) dados: ImportarInput,
  ): Promise<LeituraDeDieta> {
    return this.importacao.importar(usuario, dados.chave, dados.mimeType, dados.alunoId ?? null);
  }
}
