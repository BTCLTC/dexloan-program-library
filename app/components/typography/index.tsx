import "@spectrum-css/typography/dist/index-vars.css";
import "@spectrum-css/typography/dist/vars.css";

export const Typography: React.FC = (props) => (
  <div className="spectrum-Typography" {...props} />
);

interface TypographyProps {
  size?: "XXL" | "XL" | "L" | "M" | "S" | "XS" | "XXS";
}

export const Heading: React.FC<TypographyProps> = ({
  size = "M",
  ...props
}) => (
  <div
    className={`spectrum-Heading spectrum-Heading--size${size}`}
    {...props}
  />
);

export const Body: React.FC<TypographyProps> = ({ size = "M", ...props }) => (
  <p className={`spectrum-Body spectrum-Body--size${size}`} {...props} />
);

export const Detail: React.FC<TypographyProps> = ({ size = "M", ...props }) => (
  <span className={`spectrum-Detail spectrum-Detail--size${size}`} {...props} />
);
