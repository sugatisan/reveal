import { useLocalSearchParams } from "expo-router";
import { ManageScreen } from "@/components/ManageScreen";

// Opened from the left panel: "New interest" (?add=1) and "All sources and settings".
export default function Manage() {
  const { add } = useLocalSearchParams<{ add?: string }>();
  return <ManageScreen stacked focusAdd={add === "1"} />;
}
