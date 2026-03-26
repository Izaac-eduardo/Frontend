import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import Footer from "../components/globals/Footer";
import NavBar from "../components/globals/NavBar";
import api from "../services/api";

type CartItem = {
  id: number;
  listing?: {
    price: number | string;
    game?: { title?: string };
    platform?: { name?: string };
  };
};

type CartResponse = { items: CartItem[] };

type OrderResponse = {
  id: number;
  orderNumber: string;
  totalAmount: number | string;
  status: string;
};

type CheckoutCreateResponse = {
  order: OrderResponse;
  payment: {
    provider: string;
    method: string;
    checkoutUrl: string;
    checkoutSessionId: string;
  };
};

function toMoney(value: number) {
  return `R$ ${value.toFixed(2)}`;
}

export default function Checkout() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [items, setItems] = useState<CartItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<"card" | "pix">("card");
  const [placingOrder, setPlacingOrder] = useState(false);
  const [processingOrder, setProcessingOrder] = useState<"sync" | "cancel" | null>(null);
  const [order, setOrder] = useState<OrderResponse | null>(null);

  const subtotal = useMemo(
    () => items.reduce((sum, item) => sum + Number(item.listing?.price ?? 0), 0),
    [items],
  );

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        setError("");
        const { data } = await api.get<CartResponse>("/cart");
        setItems(data.items ?? []);
      } catch {
        setItems([]);
        setError("Nao foi possivel carregar o checkout.");
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, []);

  useEffect(() => {
    const orderId = Number(searchParams.get("orderId") ?? "0");
    if (!orderId) return;

    const loadOrder = async () => {
      try {
        const { data } = await api.get<OrderResponse>(`/orders/${orderId}`);
        setOrder(data);

        if (searchParams.get("payment") === "cancel") {
          setError("Pagamento nao concluido. Voce pode tentar novamente ou cancelar o pedido.");
        }
      } catch {
        setError("Nao foi possivel carregar o pedido apos o retorno do pagamento.");
      }
    };

    void loadOrder();
  }, [searchParams]);

  const createPendingOrder = async () => {
    try {
      setPlacingOrder(true);
      setError("");
      const { data } = await api.post<CheckoutCreateResponse>("/checkout", { paymentMethod });
      setOrder(data.order);
      setItems([]);
      window.dispatchEvent(new Event("nexus:counts-updated"));

      if (!data.payment?.checkoutUrl) {
        setError("Nao foi possivel iniciar o pagamento no provedor.");
        return;
      }

      window.location.href = data.payment.checkoutUrl;
    } catch (e: any) {
      setError(String(e?.response?.data?.message ?? "Nao foi possivel finalizar o pedido."));
    } finally {
      setPlacingOrder(false);
    }
  };

  const syncPaymentStatus = async () => {
    if (!order) return;

    try {
      setProcessingOrder("sync");
      setError("");
      const { data } = await api.post<OrderResponse>(`/orders/${order.id}/confirm-payment`);
      setOrder(data);
    } catch (e: any) {
      setError(String(e?.response?.data?.message ?? "Pagamento ainda nao confirmado no provedor."));
    } finally {
      setProcessingOrder(null);
    }
  };

  const cancelOrder = async () => {
    if (!order) return;

    try {
      setProcessingOrder("cancel");
      setError("");
      const { data } = await api.post<OrderResponse>(`/orders/${order.id}/cancel`);
      setOrder(data);
    } catch (e: any) {
      setError(String(e?.response?.data?.message ?? "Nao foi possivel cancelar o pedido."));
    } finally {
      setProcessingOrder(null);
    }
  };

  return (
    <div>
      <NavBar />
      <main className="mx-auto min-h-screen w-full max-w-4xl px-6 pb-10 pt-28">
        <h1 className="text-3xl font-bold">Checkout</h1>

        {loading && <p className="mt-4 text-gray-300">Carregando resumo...</p>}

        {!loading && order && (
          <section className="mt-6 rounded-xl bg-gray-900 p-5">
            <h2 className="text-2xl font-semibold">
              {order.status === "pending"
                ? "Pedido criado e aguardando pagamento"
                : order.status === "paid"
                  ? "Pedido confirmado"
                  : "Pedido cancelado"}
            </h2>
            <p className="mt-2 text-gray-200">Numero: {order.orderNumber}</p>
            <p className="text-gray-200">Total: {toMoney(Number(order.totalAmount ?? 0))}</p>

            {order.status === "pending" && (
              <>
                <p className="mt-2 text-sm text-gray-300">
                  Finalize o pagamento na pagina segura da Stripe. Depois, clique em atualizar status.
                </p>
                <div className="mt-4 flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      void syncPaymentStatus();
                    }}
                    disabled={processingOrder !== null}
                    className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold disabled:opacity-60"
                  >
                    {processingOrder === "sync" ? "Atualizando..." : "Atualizar status do pagamento"}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      void cancelOrder();
                    }}
                    disabled={processingOrder !== null}
                    className="rounded-lg bg-red-700 px-4 py-2 text-sm font-semibold disabled:opacity-60"
                  >
                    {processingOrder === "cancel" ? "Cancelando..." : "Cancelar pedido"}
                  </button>
                </div>
              </>
            )}

            {order.status === "paid" && (
              <div className="mt-4 flex gap-3">
                <Link to="/meus-pedidos" className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold">
                  Ver meus pedidos
                </Link>
                <Link to="/loja" className="rounded-lg bg-gray-700 px-4 py-2 text-sm">Continuar comprando</Link>
              </div>
            )}

            {order.status === "cancelled" && (
              <div className="mt-4 flex gap-3">
                <Link to="/loja" className="rounded-lg bg-gray-700 px-4 py-2 text-sm">Voltar para loja</Link>
              </div>
            )}
          </section>
        )}

        {!loading && !order && (
          <section className="mt-6 rounded-xl bg-gray-900 p-5">
            {items.length === 0 ? (
              <>
                <p className="text-gray-300">Seu carrinho esta vazio.</p>
                <Link to="/loja" className="mt-3 inline-block rounded-lg bg-blue-700 px-4 py-2 text-sm">
                  Ir para loja
                </Link>
              </>
            ) : (
              <>
                <ul className="space-y-2">
                  {items.map((item) => (
                    <li key={item.id} className="flex items-center justify-between rounded-md bg-gray-800 px-3 py-2">
                      <div>
                        <p className="font-medium">{item.listing?.game?.title || "Jogo"}</p>
                        <p className="text-sm text-gray-300">{item.listing?.platform?.name || "-"}</p>
                      </div>
                      <p>{toMoney(Number(item.listing?.price ?? 0))}</p>
                    </li>
                  ))}
                </ul>

                <div className="mt-4 rounded-lg bg-gray-800 p-3">
                  <p className="font-semibold">Total: {toMoney(subtotal)}</p>
                  <label className="mt-3 block text-sm text-gray-300">Forma de pagamento</label>
                  <select
                    value={paymentMethod}
                    onChange={(e) => setPaymentMethod(e.target.value as "card" | "pix")}
                    className="mt-1 w-full rounded-md bg-gray-700 px-3 py-2"
                  >
                    <option value="card">Cartao</option>
                    <option value="pix">PIX</option>
                  </select>
                  <p className="mt-2 text-xs text-gray-400">
                    Voce vai inserir os dados do cartao na tela segura da Stripe. Nenhum dado sensivel fica salvo no nosso banco.
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      void createPendingOrder();
                    }}
                    disabled={placingOrder}
                    className="mt-4 w-full rounded-lg bg-emerald-700 px-4 py-2 font-semibold disabled:opacity-60"
                  >
                    {placingOrder ? "Iniciando pagamento..." : "Ir para pagamento seguro"}
                  </button>
                </div>
              </>
            )}
          </section>
        )}

        {error && <p className="mt-4 text-red-300">{error}</p>}

        {!order && (
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="mt-6 rounded-md bg-gray-700 px-4 py-2 text-sm"
          >
            Voltar
          </button>
        )}
      </main>
      <Footer />
    </div>
  );
}
