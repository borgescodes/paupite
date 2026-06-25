export const ADMIN_WHATSAPP_NUMBER = "5591987338595";

export const ADMIN_WHATSAPP_MESSAGE =
  "Olá, preciso de ajuda para acessar o Pau Pite. Pode resetar minha senha ou verificar meu acesso?";

export function getAdminWhatsAppUrl() {
  return `https://wa.me/${ADMIN_WHATSAPP_NUMBER}?text=${encodeURIComponent(
    ADMIN_WHATSAPP_MESSAGE,
  )}`;
}
