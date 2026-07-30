'use client';

import { CatalogoPrescritivel } from '../../../../components/CatalogoPrescritivel';

export default function Medicamentos() {
  return (
    <CatalogoPrescritivel
      tipo="MEDICAMENTO"
      titulo="Medicamentos"
      subtitulo="Prescrição privativa do médico. A API recusa o cadastro por qualquer outro papel."
      exemploNome="Losartana potássica"
    />
  );
}
