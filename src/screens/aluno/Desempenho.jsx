import { useEu, useFrases } from "../../state/hooks.js";
import { useVisaoAluno } from "../../state/aluno.js";
import { Carregando, TituloPagina } from "../../ui/ui.jsx";
import { PainelDesempenho } from "../comum/Desempenho.jsx";

export default function DesempenhoAluno() {
  const eu = useEu();
  const v = useVisaoAluno(eu.id);
  const t = useFrases(v.aluno || eu);
  if (v.carregando) return <Carregando />;
  return (
    <>
      <TituloPagina eyebrow="Seus números" frase={t("painel.desempenho.titulo")}
        texto="Tudo aqui é calculado dos seus registros de questões, simulados e estudo. Sem ranking: a comparação é com você mesmo." />
      <PainelDesempenho v={v} />
    </>
  );
}
