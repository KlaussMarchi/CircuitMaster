import * as xmldom from '@xmldom/xmldom'
import { useXmldom } from '.'

// XMLDOM ONDE NÃO HÁ DOMParser: OS WORKERS QUE LEEM XML E O NODE DOS TESTES IMPORTAM ESTE MÓDULO ANTES DE TUDO
useXmldom(xmldom)
