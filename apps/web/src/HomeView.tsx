import type { FinancePlan, ShoppingActor } from "@mylyfe/domain";
import {
  applyShoppingInboxToPlan,
  clearBoughtShoppingItems,
  DEFAULT_SHOPPING_LIST_ID,
  defaultShoppingListOf,
  formatShoppingItem,
  groupShoppingItemsBySector,
  linkShoppingListGroup,
  normalizeHomeModuleState,
  removeShoppingItem,
  setShoppingItemStatus,
  sharedHomeMemberNames,
  unlinkShoppingListGroup,
  updateShoppingItemQuantity
} from "@mylyfe/domain";
import { Check, MessageCircle, Plus, RefreshCw, ShoppingBag, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState, type Dispatch, type FormEvent, type SetStateAction } from "react";
import { apiRequest } from "./lib";

export type HomeSection = "list";

type WhatsappGroup = { id: string; name: string };
type SecretaryStatus = { state?: string; message?: string };

export function HomeView({
  plan,
  setPlan,
  actor,
  admin = true
}: {
  plan: FinancePlan;
  setPlan: Dispatch<SetStateAction<FinancePlan | null>>;
  section?: HomeSection;
  actor?: ShoppingActor;
  admin?: boolean;
}) {
  const home = useMemo(() => normalizeHomeModuleState(plan.home), [plan.home]);
  const list = defaultShoppingListOf(home);
  const listId = list?.id ?? DEFAULT_SHOPPING_LIST_ID;
  const [draft, setDraft] = useState("");
  const [groups, setGroups] = useState<WhatsappGroup[]>([]);
  const [groupsNote, setGroupsNote] = useState("");
  const [loadingGroups, setLoadingGroups] = useState(false);
  const [secretaryState, setSecretaryState] = useState("");
  const [showManualId, setShowManualId] = useState(false);
  const [groupDraft, setGroupDraft] = useState(list?.whatsappGroupJid ?? "");

  useEffect(() => {
    setGroupDraft(list?.whatsappGroupJid ?? "");
  }, [list?.whatsappGroupJid]);

  const loadGroups = useCallback(async () => {
    setLoadingGroups(true);
    try {
      const [statusResponse, groupsResponse] = await Promise.all([
        apiRequest("/secretary/status"),
        apiRequest("/secretary/groups")
      ]);
      const status = (await statusResponse.json().catch(() => ({}))) as SecretaryStatus;
      const payload = (await groupsResponse.json().catch(() => ({}))) as {
        groups?: WhatsappGroup[];
        message?: string;
        error?: string;
      };
      setSecretaryState(status.state ?? "");
      setGroups(payload.groups ?? []);
      setGroupsNote(payload.error || payload.message || "");
    } catch {
      setGroupsNote("Nao foi possivel listar os grupos da Secretaria.");
    } finally {
      setLoadingGroups(false);
    }
  }, []);

  useEffect(() => {
    void loadGroups();
  }, [loadGroups]);

  const apply = (next: FinancePlan) => setPlan(next);

  const openItems = useMemo(() => (list?.items ?? []).filter((item) => item.status === "open"), [list?.items]);
  const boughtItems = useMemo(() => (list?.items ?? []).filter((item) => item.status === "bought"), [list?.items]);
  const openSectors = useMemo(() => groupShoppingItemsBySector(openItems), [openItems]);
  const boughtSectors = useMemo(() => groupShoppingItemsBySector(boughtItems), [boughtItems]);
  const linked = Boolean(list?.whatsappGroupJid);

  const sharedNames = useMemo(() => sharedHomeMemberNames(plan), [plan]);

  const addFromDraft = (event?: FormEvent) => {
    event?.preventDefault();
    if (!draft.trim()) return;
    const owner = plan.profile.people.find((person) => person.role === "primary");
    const result = applyShoppingInboxToPlan(plan, listId, draft.trim(), {
      personId: actor?.personId ?? owner?.id,
      name: actor?.name ?? owner?.name
    });
    if (!result.ignored) apply(result.plan);
    setDraft("");
  };

  const personLabel = (item: { addedByName?: string; addedByPersonId?: string }) => {
    if (item.addedByName) return item.addedByName;
    const person = plan.profile.people.find((entry) => entry.id === item.addedByPersonId);
    return person?.name || "";
  };

  return (
    <div className="page">
      <header className="page-header">
        <span>MyLyfe / Casa</span>
        <h1>Mercado</h1>
        <p>
          {sharedNames.length
            ? `Lista compartilhada com ${sharedNames.join(", ")}. Mande o item no WhatsApp ou escreva aqui.`
            : "Mande o item no grupo do WhatsApp ou escreva aqui. Cada item ja entra no setor certo e a lista sai separada por corredor."}
        </p>
      </header>

      <section className="metric-grid compact">
        <article className={`metric-card ${openItems.length ? "tone-warn" : "tone-good"}`}>
          <div>
            <ShoppingBag />
          </div>
          <span>Falta comprar</span>
          <strong>{openItems.length}</strong>
          <small>{boughtItems.length ? `${boughtItems.length} ja marcados` : "Lista limpa"}</small>
        </article>
        <article className={`metric-card ${linked ? "tone-good" : ""}`}>
          <div>
            <MessageCircle />
          </div>
          <span>Grupo WhatsApp</span>
          <strong>{linked ? "Ligado" : "Aguardando"}</strong>
          <small>{linked ? "A Secretaria escuta esse grupo" : "Crie o grupo e vincule abaixo"}</small>
        </article>
      </section>

      <section className="panel wide">
        <header>
          <div>
            <ShoppingBag />
            <h2>Lista</h2>
          </div>
        </header>
        <form className="routine-capture" onSubmit={addFromDraft}>
          <input
            value={draft}
            placeholder="Maionese, 2 leite, queijo prato..."
            onChange={(event) => setDraft(event.target.value)}
          />
          <button className="primary-button" type="submit">
            <Plus size={16} /> Adicionar
          </button>
        </form>

        {openItems.length === 0 && (
          <div className="empty-state">
            <span>Nada pendente</span>
            <small>Mande “maionese” no grupo ou adicione aqui.</small>
          </div>
        )}

        <div className="shopping-list">
          {openSectors.map((group) => (
            <section key={group.sector} className="shopping-sector">
              <h3>{group.label}</h3>
              {group.items.map((item) => (
                <article key={item.id} className="shopping-item">
                  <button
                    className="shopping-check"
                    type="button"
                    aria-label={`Marcar ${item.name}`}
                    onClick={() => apply(setShoppingItemStatus(plan, listId, item.id, "bought"))}
                  >
                    <Check size={16} />
                  </button>
                  <div>
                    <strong>{formatShoppingItem(item)}</strong>
                    {personLabel(item) ? <span>Pedido por {personLabel(item)}</span> : null}
                  </div>
                  <input
                    className="shopping-qty"
                    type="number"
                    min={1}
                    step={1}
                    value={item.quantity ?? 1}
                    onChange={(event) => {
                      const quantity = Number(event.target.value);
                      apply(updateShoppingItemQuantity(plan, listId, item.id, Number.isFinite(quantity) ? quantity : 1));
                    }}
                  />
                  <button className="icon-button" type="button" onClick={() => apply(removeShoppingItem(plan, listId, item.id))}>
                    <Trash2 size={16} />
                  </button>
                </article>
              ))}
            </section>
          ))}
        </div>
      </section>

      {boughtItems.length > 0 && (
        <section className="panel wide">
          <header>
            <div>
              <Check />
              <h2>Comprados</h2>
            </div>
            <button className="secondary-button" type="button" onClick={() => apply(clearBoughtShoppingItems(plan, listId))}>
              Limpar comprados
            </button>
          </header>
          <div className="shopping-list">
            {boughtSectors.map((group) => (
              <section key={group.sector} className="shopping-sector">
                <h3>{group.label}</h3>
                {group.items.map((item) => (
                  <article key={item.id} className="shopping-item bought">
                    <button
                      className="shopping-check done"
                      type="button"
                      aria-label={`Reabrir ${item.name}`}
                      onClick={() => apply(setShoppingItemStatus(plan, listId, item.id, "open"))}
                    >
                      <Check size={16} />
                    </button>
                    <div>
                      <strong>{formatShoppingItem(item)}</strong>
                      {personLabel(item) ? <span>Pedido por {personLabel(item)}</span> : null}
                    </div>
                    <button className="icon-button" type="button" onClick={() => apply(removeShoppingItem(plan, listId, item.id))}>
                      <Trash2 size={16} />
                    </button>
                  </article>
                ))}
              </section>
            ))}
          </div>
        </section>
      )}

      {admin && (
      <section className="panel wide">
        <header>
          <div>
            <MessageCircle />
            <h2>Grupo do mercado</h2>
          </div>
        </header>
        <ol className="shopping-steps">
          <li>
            Em <strong>Secretaria → WhatsApp</strong>, deixe a Secretaria conectada (QR escaneado).
            {secretaryState === "connected" ? " Conectada." : secretaryState ? ` Status: ${secretaryState}.` : ""}
          </li>
          <li>No WhatsApp, crie o grupo Mercado com voce, sua esposa e o numero da Secretaria.</li>
          <li>Volte aqui e escolha o grupo pelo nome. Nao precisa achar ID no WhatsApp.</li>
        </ol>

        {groups.length > 0 ? (
          <label className="field">
            <span>Escolher grupo</span>
            <select
              value={list?.whatsappGroupJid ?? ""}
              onChange={(event) => {
                const value = event.target.value;
                setGroupDraft(value);
                apply(value ? linkShoppingListGroup(plan, listId, value) : unlinkShoppingListGroup(plan, listId));
              }}
            >
              <option value="">Qual grupo a Secretaria deve ouvir?</option>
              {groups.map((group) => (
                <option key={group.id} value={group.id}>
                  {group.name || group.id}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <p className="panel-note">
            {secretaryState === "connected"
              ? "A Secretaria esta conectada, mas ainda nao ve nenhum grupo. Adicione o numero dela no Mercado e toque em Atualizar grupos."
              : "A lista de grupos so aparece quando a Secretaria esta conectada. Conecte o WhatsApp e depois atualize."}
          </p>
        )}

        <div className="secretary-alert-actions">
          <button className="secondary-button" type="button" onClick={() => void loadGroups()} disabled={loadingGroups}>
            <RefreshCw size={16} /> {loadingGroups ? "Atualizando..." : "Atualizar grupos"}
          </button>
          {linked && (
            <button className="secondary-button" type="button" onClick={() => apply(unlinkShoppingListGroup(plan, listId))}>
              Desvincular
            </button>
          )}
        </div>

        {groupsNote && secretaryState !== "connected" && <p className="panel-note">{groupsNote}</p>}

        <button className="chip-button" type="button" onClick={() => setShowManualId((current) => !current)}>
          {showManualId ? "Esconder ID tecnico" : "Colar ID tecnico"}
        </button>
        {showManualId && (
          <div className="form-grid" style={{ marginTop: 12 }}>
            <label className="field">
              <span>JID do grupo</span>
              <input
                value={groupDraft}
                placeholder="So se o grupo nao aparecer na lista"
                onChange={(event) => setGroupDraft(event.target.value)}
              />
            </label>
            <button
              className="primary-button"
              type="button"
              onClick={() => apply(linkShoppingListGroup(plan, listId, groupDraft))}
              disabled={!groupDraft.trim()}
            >
              Vincular grupo
            </button>
          </div>
        )}
      </section>
      )}
    </div>
  );
}
