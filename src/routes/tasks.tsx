import { useCallback, useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { GripVertical, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export const Route = createFileRoute("/tasks")({
  head: () => ({ meta: [{ title: "Tasks — Korven Console" }] }),
  component: TasksPage,
});

const STORAGE_KEY = "korven.dashboard.tasks.v1";

export type TaskColumnId = "ideas" | "backlog" | "doing" | "done";

export type KorvenTaskCard = {
  id: string;
  columnId: TaskColumnId;
  title: string;
  note: string;
  createdAt: number;
};

type BoardV1 = { version: 1; cards: KorvenTaskCard[] };

const COLUMNS: { id: TaskColumnId; title: string; hint: string }[] = [
  { id: "ideas", title: "Ideias", hint: "Rascunhos e inspiração" },
  { id: "backlog", title: "Backlog", hint: "Pronto para priorizar" },
  { id: "doing", title: "Em progresso", hint: "Em andamento agora" },
  { id: "done", title: "Concluído", hint: "Entregue / arquivo" },
];

function loadBoard(): KorvenTaskCard[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as BoardV1;
    if (parsed?.version !== 1 || !Array.isArray(parsed.cards)) return [];
    return parsed.cards.filter(
      (c) =>
        c &&
        typeof c.id === "string" &&
        COLUMNS.some((col) => col.id === c.columnId) &&
        typeof c.title === "string",
    );
  } catch {
    return [];
  }
}

function saveBoard(cards: KorvenTaskCard[]) {
  if (typeof window === "undefined") return;
  const payload: BoardV1 = { version: 1, cards };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
}

function newId(): string {
  return crypto.randomUUID();
}

function TasksPage() {
  const [cards, setCards] = useState<KorvenTaskCard[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [dragCardId, setDragCardId] = useState<string | null>(null);
  const [dragOverColumn, setDragOverColumn] = useState<TaskColumnId | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogColumn, setDialogColumn] = useState<TaskColumnId>("ideas");
  const [editCard, setEditCard] = useState<KorvenTaskCard | null>(null);
  const [formTitle, setFormTitle] = useState("");
  const [formNote, setFormNote] = useState("");

  useEffect(() => {
    setCards(loadBoard());
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    saveBoard(cards);
  }, [cards, hydrated]);

  const cardsByColumn = useMemo(() => {
    const map = new Map<TaskColumnId, KorvenTaskCard[]>();
    for (const col of COLUMNS) map.set(col.id, []);
    for (const c of cards) {
      const list = map.get(c.columnId);
      if (list) list.push(c);
    }
    for (const list of map.values()) {
      list.sort((a, b) => b.createdAt - a.createdAt);
    }
    return map;
  }, [cards]);

  const openCreate = (columnId: TaskColumnId) => {
    setEditCard(null);
    setDialogColumn(columnId);
    setFormTitle("");
    setFormNote("");
    setDialogOpen(true);
  };

  const openEdit = (card: KorvenTaskCard) => {
    setEditCard(card);
    setDialogColumn(card.columnId);
    setFormTitle(card.title);
    setFormNote(card.note ?? "");
    setDialogOpen(true);
  };

  const submitDialog = () => {
    const title = formTitle.trim();
    if (!title) return;
    if (editCard) {
      setCards((prev) =>
        prev.map((c) =>
          c.id === editCard.id ? { ...c, title, note: formNote.trim(), columnId: dialogColumn } : c,
        ),
      );
    } else {
      setCards((prev) => [
        ...prev,
        {
          id: newId(),
          columnId: dialogColumn,
          title,
          note: formNote.trim(),
          createdAt: Date.now(),
        },
      ]);
    }
    setDialogOpen(false);
  };

  const removeCard = useCallback((id: string) => {
    setCards((prev) => prev.filter((c) => c.id !== id));
  }, []);

  const moveCardToColumn = useCallback((cardId: string, columnId: TaskColumnId) => {
    setCards((prev) => prev.map((c) => (c.id === cardId ? { ...c, columnId } : c)));
  }, []);

  const onDragStart = (e: React.DragEvent, cardId: string) => {
    e.dataTransfer.setData("text/korven-task-id", cardId);
    e.dataTransfer.effectAllowed = "move";
    setDragCardId(cardId);
  };

  const onDragEnd = () => {
    setDragCardId(null);
    setDragOverColumn(null);
  };

  const onColumnDragOver = (e: React.DragEvent, columnId: TaskColumnId) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOverColumn(columnId);
  };

  const onColumnDragLeave = () => {
    setDragOverColumn(null);
  };

  const onColumnDrop = (e: React.DragEvent, columnId: TaskColumnId) => {
    e.preventDefault();
    const id = e.dataTransfer.getData("text/korven-task-id");
    if (id) moveCardToColumn(id, columnId);
    setDragCardId(null);
    setDragOverColumn(null);
  };

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="font-mono text-xl font-semibold uppercase tracking-[0.2em]">Tasks</h1>
        <p className="mt-1 max-w-2xl font-mono text-xs text-muted-foreground">
          Quadro estilo Trello para ideias e entregas da Korven Lab. Os dados ficam neste navegador
          (localStorage). Arraste os cartões entre colunas.
        </p>
      </div>

      <div className="flex gap-4 overflow-x-auto pb-4">
        {COLUMNS.map((col) => {
          const list = cardsByColumn.get(col.id) ?? [];
          const highlight = dragOverColumn === col.id;
          return (
            <div
              key={col.id}
              className={`flex w-[min(100vw-3rem,280px)] shrink-0 flex-col rounded-lg border bg-card/50 transition-colors ${
                highlight ? "border-primary ring-1 ring-primary/40" : "border-border"
              }`}
              onDragOver={(e) => onColumnDragOver(e, col.id)}
              onDragLeave={onColumnDragLeave}
              onDrop={(e) => onColumnDrop(e, col.id)}
            >
              <div className="border-b border-border px-3 py-2">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <h2 className="font-mono text-[11px] font-semibold uppercase tracking-wider">{col.title}</h2>
                    <p className="font-mono text-[10px] text-muted-foreground">{col.hint}</p>
                  </div>
                  <span className="rounded border border-border px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                    {list.length}
                  </span>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="mt-2 h-7 w-full justify-start gap-1 font-mono text-[10px] uppercase tracking-wider"
                  onClick={() => openCreate(col.id)}
                >
                  <Plus className="h-3.5 w-3.5" />
                  Novo cartão
                </Button>
              </div>
              <div className="flex max-h-[calc(100vh-220px)] flex-col gap-2 overflow-y-auto p-2">
                {list.map((card) => (
                  <Card
                    key={card.id}
                    draggable
                    onDragStart={(e) => onDragStart(e, card.id)}
                    onDragEnd={onDragEnd}
                    className={`cursor-grab border-border/80 bg-background/80 shadow-sm active:cursor-grabbing ${
                      dragCardId === card.id ? "opacity-60" : ""
                    }`}
                  >
                    <CardHeader className="flex flex-row items-start gap-1 space-y-0 p-2 pb-1">
                      <GripVertical className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                      <button
                        type="button"
                        onClick={() => openEdit(card)}
                        className="min-w-0 flex-1 text-left font-mono text-xs font-medium leading-snug hover:underline"
                      >
                        {card.title}
                      </button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive"
                        aria-label="Remover cartão"
                        onClick={(e) => {
                          e.stopPropagation();
                          removeCard(card.id);
                        }}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </CardHeader>
                    {card.note ? (
                      <CardContent className="px-2 pb-2 pt-0">
                        <p className="line-clamp-4 font-mono text-[10px] leading-relaxed text-muted-foreground">
                          {card.note}
                        </p>
                      </CardContent>
                    ) : null}
                  </Card>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="border-border bg-card font-mono sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-sm uppercase tracking-wider">
              {editCard ? "Editar cartão" : "Novo cartão"}
            </DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <div className="grid gap-1">
              <Label htmlFor="task-col" className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Coluna
              </Label>
              <select
                id="task-col"
                className="h-9 rounded-md border border-border bg-background px-2 text-xs"
                value={dialogColumn}
                onChange={(e) => setDialogColumn(e.target.value as TaskColumnId)}
              >
                {COLUMNS.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.title}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid gap-1">
              <Label htmlFor="task-title" className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Título
              </Label>
              <Input
                id="task-title"
                value={formTitle}
                onChange={(e) => setFormTitle(e.target.value)}
                placeholder="Ex.: Publicar métricas Wagoo no dashboard"
                className="font-mono text-xs"
              />
            </div>
            <div className="grid gap-1">
              <Label htmlFor="task-note" className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Notas (opcional)
              </Label>
              <Textarea
                id="task-note"
                value={formNote}
                onChange={(e) => setFormNote(e.target.value)}
                placeholder="Detalhes, links, critérios de pronto…"
                rows={4}
                className="resize-y font-mono text-xs"
              />
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" className="font-mono text-xs" onClick={() => setDialogOpen(false)}>
              Cancelar
            </Button>
            <Button type="button" className="font-mono text-xs" onClick={submitDialog} disabled={!formTitle.trim()}>
              {editCard ? "Salvar" : "Adicionar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
