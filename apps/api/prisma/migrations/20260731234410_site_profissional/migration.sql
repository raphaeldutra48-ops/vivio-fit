-- CreateTable
CREATE TABLE "PerfilPublico" (
    "id" TEXT NOT NULL,
    "profissionalId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "apresentacao" TEXT,
    "cidade" TEXT,
    "uf" TEXT,
    "atendeOnline" BOOLEAN NOT NULL DEFAULT true,
    "atendePresencial" BOOLEAN NOT NULL DEFAULT false,
    "whatsapp" TEXT,
    "instagram" TEXT,
    "publicado" BOOLEAN NOT NULL DEFAULT false,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PerfilPublico_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PedidoDeContato" (
    "id" TEXT NOT NULL,
    "perfilId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "telefone" TEXT,
    "mensagem" TEXT,
    "atendidoEm" TIMESTAMP(3),
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PedidoDeContato_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PerfilPublico_profissionalId_key" ON "PerfilPublico"("profissionalId");

-- CreateIndex
CREATE UNIQUE INDEX "PerfilPublico_slug_key" ON "PerfilPublico"("slug");

-- CreateIndex
CREATE INDEX "PedidoDeContato_perfilId_criadoEm_idx" ON "PedidoDeContato"("perfilId", "criadoEm" DESC);

-- AddForeignKey
ALTER TABLE "PerfilPublico" ADD CONSTRAINT "PerfilPublico_profissionalId_fkey" FOREIGN KEY ("profissionalId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PedidoDeContato" ADD CONSTRAINT "PedidoDeContato_perfilId_fkey" FOREIGN KEY ("perfilId") REFERENCES "PerfilPublico"("id") ON DELETE CASCADE ON UPDATE CASCADE;
