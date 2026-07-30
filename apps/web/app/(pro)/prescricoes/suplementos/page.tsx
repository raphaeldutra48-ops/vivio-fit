'use client';

import { CatalogoPrescritivel } from '../../../../components/CatalogoPrescritivel';

export default function Suplementos() {
  return (
    <CatalogoPrescritivel
      tipo="SUPLEMENTO"
      titulo="Suplementos"
      subtitulo="Seu catálogo. O que estiver aqui pode ser prescrito na ficha do paciente."
      exemploNome="Creatina monoidratada"
    />
  );
}
