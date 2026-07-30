'use client';

import { CatalogoPrescritivel } from '../../../../components/CatalogoPrescritivel';

export default function Fitoterapicos() {
  return (
    <CatalogoPrescritivel
      tipo="FITOTERAPICO"
      titulo="Fitoterápicos"
      subtitulo="Registre contraindicações aqui — elas aparecem toda vez que o item for prescrito."
      exemploNome="Camomila (Matricaria recutita)"
    />
  );
}
