import { ListChecks } from "lucide-react";
import { useEu, useFrases } from "../../state/hooks.js";
import { useVisaoAluno } from "../../state/aluno.js";
import { Carregando, TituloPagina, Vazio } from "../../ui/ui.jsx";
import { EditalDoAluno } from "../comum/Edital.jsx";

/* Edital: as matérias em blocos; cada bloco abre os tópicos, na ordem de
   estudo, com os subtópicos como orientação. O aluno corta o que já viu,
   volta a ver o que quiser e muda a ordem, dentro do que o professor liberou. */
export default function EditalAluno() {
  const eu = useEu();
  const v = useVisaoAluno(eu.id);
  const t = useFrases(v.aluno || eu);
  if (v.carregando) return <Carregando />;
  return (
    <>
      <TituloPagina eyebrow="Seu conteúdo programático" frase={t("painel.plano.titulo")}
        texto="Toque numa matéria para ver os tópicos. Corte o que você já domina; se quiser rever, é só voltar." />
      {v.plano ? <EditalDoAluno v={v} modo="aluno" /> : (
        <div className="cartao"><Vazio icone={ListChecks} titulo="Seu edital ainda não foi montado" texto="O professor escolhe a jornada do seu vestibular; depois ela vira o seu edital, ajustável." /></div>
      )}
    </>
  );
}
