import {redirect} from "next/navigation";

// The proxy checks authentication, approval, account and maintenance access first.
export default function Home() {
  redirect("/dashboard");
}
