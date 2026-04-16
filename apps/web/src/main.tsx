import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WagmiProvider, usePublicClient, useWalletClient } from "wagmi";
import { RouterProvider, createRouter } from "@tanstack/react-router";
import ReactDOM from "react-dom/client";
import { CofheProvider, createCofheConfig, useCofheAutoConnect, FnxFloatingButtonWithProvider } from "@cofhe/react";
import { arbSepolia } from "@cofhe/sdk/chains";

import Loader from "./components/loader";
import { routeTree } from "./routeTree.gen";
import { config } from "./lib/wagmi";

const queryClient = new QueryClient();

const cofheConfig = createCofheConfig({
  supportedChains: [arbSepolia],
});

/** Bridges wagmi's wallet/public clients into CofheProvider */
function CofheAutoConnector({ children }: { children: React.ReactNode }) {
  const { data: walletClient } = useWalletClient();
  const publicClient = usePublicClient();
  useCofheAutoConnect({ walletClient: walletClient ?? undefined, publicClient });
  return <>{children}</>;
}

const router = createRouter({
  routeTree,
  defaultPreload: "intent",
  defaultPendingComponent: () => <Loader />,
  context: {},
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

const rootElement = document.getElementById("app");

if (!rootElement) {
  throw new Error("Root element not found");
}

if (!rootElement.innerHTML) {
  const root = ReactDOM.createRoot(rootElement);
  root.render(
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <CofheProvider config={cofheConfig} queryClient={queryClient}>
          <CofheAutoConnector>
            <RouterProvider router={router} />
            <FnxFloatingButtonWithProvider position="bottom-right" />
          </CofheAutoConnector>
        </CofheProvider>
      </QueryClientProvider>
    </WagmiProvider>,
  );
}
