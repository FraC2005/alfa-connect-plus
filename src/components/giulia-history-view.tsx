import { StyleSheet, View } from 'react-native';

import { Button, Card, Screen, Section, T } from '@/components/ui';
import { C, S } from '@/constants/theme';

/** Short note next to a heading, not a quote from a document the car ever carried. */
function PullQuote({ children }: { children: string }) {
  return (
    <View style={styles.quote}>
      <T variant="h3" style={styles.quoteText}>
        {children}
      </T>
    </View>
  );
}

/**
 * Short, factual article on the Giulia nameplate: the original 1962 Tipo 105/115 and the current
 * Tipo 952 (2016–), ending on the owner's own Veloce. Text only, no Alfa Romeo trademark imagery.
 */
export function GiuliaHistoryView({ onBack }: { onBack: () => void }) {
  return (
    <Screen title="La storia della Giulia" subtitle="Dal 1962 alla Veloce di oggi">
      <Card>
        <Button label="Indietro" kind="secondary" onPress={onBack} />
      </Card>

      <Section title="Le origini (1962)">
        <Card>
          <T>
            Alfa Romeo presenta la Giulia nel 1962, come erede della Giulietta. La sigla di progetto è Tipo 105 (poi anche 115 per alcune
            varianti), e il nome resterà tra i più usati della casa del Biscione.
          </T>
          <T>
            La berlina colpisce per la coda tronca, quasi tagliata di netto: una scelta non estetica ma aerodinamica, pensata dall’ufficio
            tecnico guidato da Orazio Satta Puliga per ridurre la resistenza all’aria rispetto alle forme più arrotondate dell’epoca — un
            approccio insolito per un’utilitaria del tempo.
          </T>
          <T>
            Il motore è il quattro cilindri bialbero Alfa Romeo, già apprezzato sulla Giulietta: scattante, capace di alti regimi, montato
            su una vettura via via proposta in allestimenti diversi — dalla TI (Turismo Internazionale) alla più sportiva Super.
          </T>
        </Card>
      </Section>

      <PullQuote>“Una forma pensata per tagliare l’aria, non per piacere a prima vista.”</PullQuote>

      <Section title="L’eredità sportiva">
        <Card>
          <T>
            Dalla base della berlina nascono varianti che fanno la storia del marchio: la Sprint GT, disegnata da Giorgetto Giugiaro per
            Bertone, e la GTA (“Gran Turismo Alleggerita”), versione da competizione realizzata con pannelli in alluminio al posto
            dell’acciaio.
          </T>
          <T>
            In pista e nei rally la famiglia Giulia porta ad Alfa Romeo diversi titoli nel Campionato Europeo Turismo durante gli anni
            Sessanta. Sulle strade italiane, la Giulia Super diventa anche l’auto delle forze dell’ordine, con la Polizia Stradale che la
            soprannomina “Pantera” per la sua velocità rispetto alle auto comuni del periodo.
          </T>
          <T>
            La produzione delle varie declinazioni della Giulia storica prosegue, con aggiornamenti, fino alla seconda metà degli anni
            Settanta, quando il nome viene messo da parte per diverse generazioni di berline Alfa Romeo.
          </T>
        </Card>
      </Section>

      <Section title="La rinascita (2016)">
        <Card>
          <T>
            Dopo la fine della Giulia storica, il nome resta per decenni fuori produzione, mentre Alfa Romeo attraversa anni difficili:
            berline via via più legate a pianali di altri marchi del gruppo, e un solo nome “storico” richiamato nel frattempo — la
            Giulietta, tornata nel 2010 su un modello compatto a trazione anteriore, non sulla berlina media che il pubblico si aspettava.
          </T>
          <T>
            Un primo tentativo di far rinascere proprio la Giulia risale agli anni attorno al 2010-2011: un progetto a trazione anteriore,
            pensato per condividere il pianale con la futura Chrysler 200 nell’ambito dei piani Fiat-Chrysler pre-2014. Secondo più fonti
            dell’epoca, l’allora amministratore delegato Sergio Marchionne lo giudicò insoddisfacente nello stile e nella sostanza, e il
            lavoro — già avanzato — venne accantonato invece di arrivare in produzione.
          </T>
        </Card>
      </Section>

      <Section title="Il cantiere Giorgio">
        <Card>
          <T>
            La svolta arriva con la decisione di ripartire da zero: niente più pianali condivisi con auto a trazione anteriore di altri
            marchi, ma un’architettura inedita, a trazione posteriore, pensata su misura per Alfa Romeo. Il nome di progetto è “Giorgio”.
            Alcune fonti di settore riportano l’inizio dei lavori nella primavera del 2013, con un gruppo di ingegneri riunito a Modena
            (sede storica Maserati) e, secondo diverse ricostruzioni giornalistiche, Philippe Krief — con un passato in Ferrari — indicato
            come responsabile tecnico del progetto: un’attribuzione ricorrente nella stampa di settore, non confermata da un comunicato
            ufficiale consultato per questo testo.
          </T>
          <T>
            Nel maggio 2014 Marchionne presenta agli investitori un piano quinquennale per Alfa Romeo: circa 5 miliardi di euro di
            investimento e otto modelli completamente nuovi, con l’obiettivo dichiarato di far salire le vendite del marchio da circa
            74.000 auto (2013) a oltre 400.000 entro il 2018. La Giulia, prima vettura della nuova architettura Giorgio, è il fulcro di
            quel piano: il banco di prova per dimostrare che Alfa Romeo poteva tornare a costruire berline a trazione posteriore “vere”,
            dopo decenni di modelli quasi tutti a trazione anteriore.
          </T>
        </Card>
      </Section>

      <Section title="Un lancio in salita">
        <Card>
          <T>
            La strada verso le concessionarie non è lineare. Sul finire del 2015 la stampa di settore riporta ritardi nel programma
            Giorgio: la Quadrifoglio e il SUV derivato (poi la Stelvio) slittano di diversi mesi. Una ricostruzione, mai confermata nei
            termini esatti da Alfa Romeo, parlò di test di crash falliti; l’azienda smentì quella versione specifica, pur ammettendo
            ritardi legati a messa a punto e sicurezza. In quel periodo rientra in Alfa Romeo, dalla BMW, l’ingegnere Roberto Fedeli come
            responsabile tecnico del marchio.
          </T>
          <T>
            Anche dopo il debutto, i primi anni di vita della Giulia non sono privi di difficoltà: diverse fonti di stampa e rapporti di
            affidabilità segnalano, per le prime annate (2016-2017), problemi di messa a punto della componentistica elettronica e alcune
            campagne di richiamo (tra cui una, negli Stati Uniti, relativa alla pompa del carburante su esemplari 2017-2019, ma
            annunciata anni dopo, nel 2025) — il numero esatto di richiami e la loro gravità variano secondo la fonte, e non sono
            riportati qui con una cifra precisa. Le vendite,
            nel frattempo, crescono più lentamente di quanto previsto dal piano 2014: il segmento delle berline sportive premium resta
            dominato dai marchi tedeschi, e l’obiettivo delle 400.000 unità annue non viene raggiunto.
          </T>
        </Card>
      </Section>

      <Section title="Un’ambizione tecnica vera">
        <Card>
          <T>
            Al di là delle difficoltà di lancio, l’architettura Giorgio resta un cambio di rotta genuino per un marchio che, dagli anni
            Settanta-Ottanta in poi, aveva costruito quasi solo modelli a trazione anteriore. La Giulia adotta la trazione posteriore
            (con Q4 integrale disponibile su gran parte della gamma), una ripartizione dei pesi tra i due assi vicina al 50/50 e un
            albero di trasmissione in fibra di carbonio, presente su gran parte della gamma Giulia — incluse le versioni diesel come la
            tua — per contenere pesi e inerzie.
          </T>
          <T>
            Il debutto commerciale avviene con la versione più estrema, la Quadrifoglio: un sei cilindri turbo benzina da circa 510 CV.
            Al lancio, la Quadrifoglio ottiene uno dei tempi sul giro più veloci mai registrati al Nürburgring Nordschleife per una
            berlina quattro porte — una cifra diventata presto un punto di riferimento, anche se nel tempo altre vetture l’hanno
            avvicinata o superata. Sotto la Quadrifoglio, la gamma propone allestimenti più orientati all’uso quotidiano: tra questi, la
            Veloce.
          </T>
        </Card>
      </Section>

      <Section title="La tua Giulia: Veloce 2.2 Multijet Q4">
        <Card>
          <T>
            La Veloce è il gradino sportivo della gamma “normale”, sotto la Quadrifoglio: sospensioni e sterzo con una taratura più
            decisa, dettagli estetici specifici, e lo stesso impianto a trazione posteriore della piattaforma Giorgio — qui abbinato,
            come nella tua auto, alla trazione integrale Q4.
          </T>
          <T>
            Il motore è il quattro cilindri 2.2 Multijet turbodiesel: sulla Veloce questa motorizzazione è stata proposta, nelle fonti
            consultate, con una potenza di circa 210 CV (154 kW) e 470 Nm di coppia, abbinata di serie al cambio automatico a 8 rapporti
            e alla trazione integrale Q4 — non solo alla Quadrifoglio a benzina. La cifra esatta può variare leggermente da un anno
            modello all’altro: se la targa della tua auto riporta un valore diverso, fa fede quella.
          </T>
          <T variant="caption">
            Il filtro antiparticolato (FAP/DPF) è un componente tipico dei motori diesel come questo: non esiste sulle versioni a benzina
            della Giulia. Oggi l’app non legge il suo stato tra i dati diagnostici.
          </T>
          <T variant="caption">
            I dati reali della tua Giulia — carburante, chilometraggio, pneumatici e il resto — restano nella schermata Veicolo: questa è
            una pagina di sola lettura sulla storia del modello, non una fonte di dati sulla tua auto.
          </T>
        </Card>
      </Section>

      <Section title="Fonti">
        <Card>
          <T variant="caption">
            Testo scritto a partire da conoscenza generale sulla storia dell’automobile, enciclopedie automobilistiche e articoli di
            stampa specializzata (tra cui copertura dell’epoca di testate come Autocar, Wheels/WhichCar e siti di settore su listini e
            schede tecniche) consultati per verificare le cifre più recenti; non da documentazione ufficiale Alfa Romeo. Date, cifre e
            attribuzioni più incerte sono segnalate nel testo invece di essere presentate come esatte.
          </T>
        </Card>
      </Section>
    </Screen>
  );
}

const styles = StyleSheet.create({
  quote: { borderLeftWidth: 3, borderLeftColor: C.accent, paddingLeft: S.md, paddingVertical: S.xs },
  quoteText: { fontStyle: 'italic', color: C.textSecondary },
});
