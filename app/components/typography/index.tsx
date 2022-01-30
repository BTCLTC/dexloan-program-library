import "@spectrum-css/typography/index.css";

export const Typography: React.FC = (props) => (
  <div className="spectrum-Typography" {...props} />
);

export const Heading: React.FC = (props) => (
  <h1 className="spectrum-Heading spectrum-Heading--sizeXXL" {...props} />
);

export const Body: React.FC = (props) => (
  <p className="spectrum-Body spectrum-Body--sizeM" {...props} />
);

export const Detail: React.FC = (props) => (
  <p className="spectrum-Detail spectrum-Detail--sizeXL" {...props} />
);
