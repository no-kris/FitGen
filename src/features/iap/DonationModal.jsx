import { useEffect, useState } from "react";
import Modal from "../../components/ui/Modal";
import Button from "../../components/ui/Button";
import { iapService } from "../../services/iap/iapService";
import { Heart } from "lucide-react";

export default function DonationModal({ isOpen, onClose }) {
  if (!isOpen) return;
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (isOpen) {
      loadProducts();
    }
  }, [isOpen]);

  const loadProducts = async () => {
    setLoading(true);
    setError(null);
    try {
      await iapService.initialize();
      const loadedProducts = iapService.getProducts();
      setProducts(loadedProducts);
    } catch (err) {
      console.error("Failed to load IAP products", err);
      setError("Failed to load donation options. Please try again later.");
    } finally {
      setLoading(false);
    }
  };

  const handleDonate = async (product) => {
    try {
      await iapService.purchase(product);
    } catch (err) {
      console.error("Purchase failed", err);
    }
  };

  // Listen for success to close modal
  useEffect(() => {
    const handleSuccess = () => {
      onClose();
      alert("Thank you for your support! It means the world to me.");
    };
    window.addEventListener("iap-purchase-success", handleSuccess);
    return () =>
      window.removeEventListener("iap-purchase-success", handleSuccess);
  }, [onClose]);

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Support Development">
      <div className="flex flex-col items-center gap-6 p-2">
        <Heart size={48} className="text-red-500 fill-current animate-pulse" />

        <p className="text-center text-lg">
          If you enjoy using FitGen, consider supporting its development! Your
          support helps keep the lights on and the protein shakes flowing.
        </p>

        {loading && <p className="animate-pulse">Loading options...</p>}
        {error && <p className="text-error">{error}</p>}

        <div className="w-full flex flex-col gap-3">
          {products.length === 0 && !loading && !error && (
            <p className="text-center text-muted">
              No donation options found (Check Internet/Store Connection).
            </p>
          )}

          {products.map((product) => (
            <Button
              key={product.id}
              text={`Donate ${product.pricing?.price || product.title} `}
              onClick={() => handleDonate(product)}
              className="button btn-primary w-full text-xl p-4 uppercase font-bold"
            />
          ))}
        </div>

        <Button
          text="Maybe Later"
          onClick={onClose}
          className="text-muted uppercase mt-2"
        />
      </div>
    </Modal>
  );
}
