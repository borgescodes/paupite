export const SUPPORT_WHATSAPP_NUMBER = "91987338595";
export const SUPPORT_WHATSAPP_MESSAGE =
  "Olá, preciso de ajuda para acessar o Pau Pite. Pode resetar minha senha ou verificar meu acesso?";

export function getSupportWhatsAppUrl() {
  return `https://wa.me/55${SUPPORT_WHATSAPP_NUMBER}?text=${encodeURIComponent(
    SUPPORT_WHATSAPP_MESSAGE,
  )}`;
}
