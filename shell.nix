{ pkgs ? import <nixpkgs> {} }:

pkgs.mkShell {
  buildInputs = with pkgs; [
    nodejs_22
    openssl
    pkg-config
    prisma-engines
  ];

  shellHook = ''
    export PRISMA_SCHEMA_ENGINE_BINARY="${pkgs.prisma-engines}/bin/schema-engine"
    export PRISMA_ENGINES_CHECKSUM_IGNORE_MISSING=1
    export LD_LIBRARY_PATH="${pkgs.openssl.out}/lib:$LD_LIBRARY_PATH"

    echo ""
    echo "🚗 SGA Skoda CRM Development Shell"
    echo "   Node.js: $(node --version)"
    echo "   npm: $(npm --version)"
    echo ""
    echo "   Run 'npm install' to install dependencies"
    echo "   Run 'npx prisma generate' to generate client"
    echo "   Run 'npx prisma migrate dev' to setup database"
    echo "   Run 'npm run dev' to start development server"
    echo ""
  '';
}
