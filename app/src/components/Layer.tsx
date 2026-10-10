// A full-screen layer above everything (tab bar included). On the phone this is a native Modal.
import type { ReactNode } from "react";
import { Modal } from "react-native";
export function Layer({ visible, onRequestClose, children }: { visible: boolean; onRequestClose: () => void; children: ReactNode }) {
  return <Modal visible={visible} transparent animationType="fade" onRequestClose={onRequestClose} statusBarTranslucent>{children}</Modal>;
}
