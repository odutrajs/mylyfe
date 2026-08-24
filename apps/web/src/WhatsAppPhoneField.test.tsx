import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { WhatsAppPhoneField } from "./WhatsAppPhoneField";

const apiRequest = vi.fn();

vi.mock("./lib", async () => {
  const actual = await vi.importActual<typeof import("./lib")>("./lib");
  return {
    ...actual,
    apiRequest: (...args: unknown[]) => apiRequest(...args)
  };
});

describe("WhatsAppPhoneField", () => {
  beforeEach(() => {
    apiRequest.mockReset();
  });

  it("sends and confirms a verification code", async () => {
    const user = userEvent.setup();
    const onPhoneChange = vi.fn();
    const onVerified = vi.fn();

    apiRequest
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ phone: "41999990000" })
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          phone: "41999990000",
          whatsappVerifiedAt: "2025-03-01T12:00:00.000Z"
        })
      });

    render(
      <WhatsAppPhoneField
        phone="41999990000"
        onPhoneChange={onPhoneChange}
        onVerified={onVerified}
      />
    );

    await user.click(screen.getByRole("button", { name: /enviar codigo/i }));

    await waitFor(() => {
      expect(apiRequest).toHaveBeenCalledWith("/secretary/phone/start", expect.any(Object));
    });

    expect(
      screen.getByText(/mandei um codigo de 6 digitos neste whatsapp/i)
    ).toBeInTheDocument();

    await user.type(screen.getByLabelText(/codigo de 6 digitos/i), "123456");
    await user.click(screen.getByRole("button", { name: /confirmar whatsapp/i }));

    await waitFor(() => {
      expect(apiRequest).toHaveBeenCalledWith("/secretary/phone/confirm", expect.any(Object));
    });

    expect(onVerified).toHaveBeenCalledWith("41999990000", "2025-03-01T12:00:00.000Z");
    expect(screen.getByText(/whatsapp confirmado/i)).toBeInTheDocument();
  });
});
